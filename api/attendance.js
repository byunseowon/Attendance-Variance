function extractRows(payload) {
  const data = payload?.query_result?.data || payload?.data || payload;
  if (!data) return [];
  if (Array.isArray(data.rows)) {
    if (data.rows.length && Array.isArray(data.rows[0]) && Array.isArray(data.columns)) {
      return data.rows.map(values => Object.fromEntries(data.columns.map((column, i) => [column.name, values[i]])));
    }
    return data.rows;
  }
  return Array.isArray(data) ? data : [];
}

function redashHeaders(apiKey) {
  return {
    Accept: 'application/json',
    Authorization: `Key ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runRedashQuery(queryId, params) {
  const baseUrl = String(process.env.REDASH_URL || '').replace(/\/$/, '');
  const apiKey = process.env.REDASH_DETAIL_USER_API_KEY || process.env.REDASH_API_KEY || process.env.REDASH_DETAIL_API_KEY || '';
  if (!baseUrl || !apiKey || !queryId) throw new Error('Redash 환경변수가 설정되지 않았습니다.');

  // 파라미터 쿼리는 latest results.json GET으로 조회할 수 없습니다.
  // POST로 실행한 뒤 job을 확인하고 해당 query_result를 읽습니다.
  const executeUrl = `${baseUrl}/api/queries/${encodeURIComponent(queryId)}/results`;
  const executeResponse = await fetch(executeUrl, {
    method: 'POST',
    headers: redashHeaders(apiKey),
    body: JSON.stringify({ max_age: 0, parameters: params })
  });
  if (!executeResponse.ok) {
    throw new Error(`Redash 파라미터 쿼리 실행 실패 (${executeResponse.status})`);
  }

  const executePayload = await executeResponse.json();
  const jobId = executePayload?.job?.id;
  if (!jobId) throw new Error('Redash 쿼리 실행 작업 ID를 받지 못했습니다.');

  let job;
  for (let attempt = 0; attempt < 30; attempt++) {
    await wait(500);
    const jobResponse = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
      headers: redashHeaders(apiKey)
    });
    if (!jobResponse.ok) throw new Error(`Redash 작업 상태 조회 실패 (${jobResponse.status})`);
    job = (await jobResponse.json()).job;
    if (job?.status === 3) break;
    if ([4, 5].includes(job?.status)) throw new Error('Redash 출결 쿼리 실행에 실패했습니다.');
  }

  if (job?.status !== 3 || !job?.query_result_id) {
    throw new Error('Redash 출결 쿼리 응답 시간이 초과되었습니다.');
  }

  const resultResponse = await fetch(
    `${baseUrl}/api/queries/${encodeURIComponent(queryId)}/results/${encodeURIComponent(job.query_result_id)}.json`,
    { headers: redashHeaders(apiKey) }
  );
  if (!resultResponse.ok) throw new Error(`Redash 결과 조회 실패 (${resultResponse.status})`);
  return extractRows(await resultResponse.json());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET 요청만 허용됩니다.' });
    return;
  }

  const cohortId = String(req.query?.cohort_id || '').trim();
  if (!cohortId) {
    res.status(400).json({ error: 'cohort_id가 필요합니다.' });
    return;
  }

  try {
    const queryId = process.env.REDASH_DETAIL_QUERY_ID || '7983';
    const rows = await runRedashQuery(queryId, { cohort_id: cohortId });
    res.status(200).json({ rows });
  } catch (error) {
    console.error('attendance api error', error);
    res.status(502).json({ error: '출결 데이터를 불러오지 못했습니다.' });
  }
};
