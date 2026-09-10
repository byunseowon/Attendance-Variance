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

async function runRedashQuery(queryId, params) {
  const baseUrl = String(process.env.REDASH_URL || '').replace(/\/$/, '');
  const apiKey = process.env.REDASH_DETAIL_API_KEY || '';
  if (!baseUrl || !apiKey || !queryId) throw new Error('Redash 환경변수가 설정되지 않았습니다.');

  const url = new URL(`${baseUrl}/api/queries/${encodeURIComponent(queryId)}/results.json`);
  url.searchParams.set('api_key', apiKey);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(`p_${key}`, value));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Redash 조회 실패 (${response.status})`);
  return extractRows(await response.json());
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
