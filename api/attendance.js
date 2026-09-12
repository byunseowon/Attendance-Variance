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

function redashHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch (_) {
    return 'invalid-url';
  }
}

async function responsePreview(response) {
  return (await response.text()).slice(0, 800);
}

async function fetchCachedRows(queryId) {
  const baseUrl = String(process.env.REDASH_URL || '').replace(/\/$/, '');
  const apiKey = process.env.REDASH_DETAIL_API_KEY || process.env.REDASH_DETAIL_USER_API_KEY || process.env.REDASH_API_KEY || '';
  if (!baseUrl || !apiKey || !queryId) throw new Error('Redash 환경변수가 설정되지 않았습니다.');

  const url = new URL(`${baseUrl}/api/queries/${encodeURIComponent(queryId)}/results.json`);
  url.searchParams.set('api_key', apiKey);
  console.log('[attendance] Redash cached result request', {
    queryId: String(queryId),
    redashHost: redashHost(baseUrl),
    hasApiKey: Boolean(apiKey),
    mode: 'cached-get'
  });

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    console.error('[attendance] Redash cached result failed', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: await responsePreview(response)
    });
    throw new Error(`Redash 저장 결과 조회 실패 (${response.status})`);
  }

  const rows = extractRows(await response.json());
  console.log('[attendance] Redash cached result received', { rowCount: rows.length });
  return rows;
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
    const allRows = await fetchCachedRows(queryId);
    const cohortKey = allRows.find(row => Object.prototype.hasOwnProperty.call(row, 'cohort_id'))
      ? 'cohort_id'
      : allRows.find(row => Object.prototype.hasOwnProperty.call(row, 'cohortid'))
        ? 'cohortid'
        : null;

    if (!cohortKey) {
      throw new Error('7983 결과에 cohort_id 컬럼이 없습니다. 전체 조회 쿼리에 cohort_id를 포함해 주세요.');
    }

    const rows = allRows.filter(row => String(row[cohortKey] || '').trim() === cohortId);
    console.log('[attendance] Cohort filter complete', {
      cohortIdLength: cohortId.length,
      sourceRowCount: allRows.length,
      matchedRowCount: rows.length
    });
    res.status(200).json({ rows });
  } catch (error) {
    console.error('attendance api error', error);
    res.status(502).json({ error: error.message || '출결 데이터를 불러오지 못했습니다.' });
  }
};
