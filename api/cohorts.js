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

async function runRedashQuery(queryId) {
  const baseUrl = String(process.env.REDASH_URL || '').replace(/\/$/, '');
  const apiKey = process.env.REDASH_CATALOG_API_KEY || '';
  if (!baseUrl || !apiKey || !queryId) throw new Error('Redash 환경변수가 설정되지 않았습니다.');

  const url = new URL(`${baseUrl}/api/queries/${encodeURIComponent(queryId)}/results.json`);
  url.searchParams.set('api_key', apiKey);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Redash 조회 실패 (${response.status})`);
  return extractRows(await response.json());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET 요청만 허용됩니다.' });
    return;
  }

  try {
    const queryId = process.env.REDASH_CATALOG_QUERY_ID || '7982';
    const rows = await runRedashQuery(queryId);
    res.status(200).json({ rows });
  } catch (error) {
    console.error('cohorts api error', error);
    res.status(502).json({ error: '트랙 목록을 불러오지 못했습니다.' });
  }
};
