-- Query 1: 트랙·기수 선택 목록
-- Redash Query ID를 index.html에 입력합니다.
SELECT
  _id AS cohort_id,
  courseid AS track_id,
  title AS cohort_title,
  cohortnum,
  startdate,
  enddate
FROM dblms_cohorts
WHERE __hevo__marked_deleted = false
  AND startdate <= CURRENT_TIMESTAMP
ORDER BY courseid, cohortnum DESC;


-- Query 2: 선택한 기수의 수강생·출결 상세
-- Redash 파라미터: cohort_id
WITH latest_attendance AS (
  SELECT
    a.*,
    ROW_NUMBER() OVER (
      PARTITION BY a.traineeid, a.roundid
      ORDER BY a.asofdate DESC, a.updatedat DESC
    ) AS row_num
  FROM dblms_trainee_attendance_summaries a
  WHERE a.__hevo__marked_deleted = false
)
SELECT
  t._id AS trainee_id,
  t.name,
  t.dateofbirth,
  c.courseid AS track_id,
  c._id AS cohort_id,
  c.title AS cohort_title,
  c.cohortnum,
  t.status AS raw_status,
  CASE
    WHEN t.status = '중도하차' THEN '중도하차'
    WHEN t.status = '수료'
         AND t.statuslogs LIKE '%출석률 80% 이상%' THEN '조기수료'
    WHEN t.status = '수료' THEN '일반 수료'
    WHEN t.status = '수강중' THEN '훈련중'
    ELSE t.status
  END AS mapped_status,
  a.asofdate,
  a.totalperiod.elapseddays AS elapsed_days,
  a.totalperiod.totaldays AS course_training_days,
  a.totalperiod.elapseddays AS training_days,
  a.totalperiod.counts.attendancedays AS attendance_days,
  a.totalperiod.counts.absentdays AS absent_days,
  a.totalperiod.elapseddays
    - a.totalperiod.counts.attendancedays
    - a.totalperiod.counts.absentdays AS unclassified_days,
  CASE
    WHEN a.totalperiod.elapseddays > 0
    THEN a.totalperiod.counts.attendancedays * 100.0
         / a.totalperiod.elapseddays
    ELSE NULL
  END AS attendance_rate,
  a.refund.coveragewarning AS coverage_warning,
  a.refund.individualqrcovereddays AS individual_qr_days,
  a.refund.peerinferreddays AS peer_inferred_days
FROM dblms_trainees t
JOIN dblms_cohorts c
  ON c._id = t.cohortid
JOIN latest_attendance a
  ON t._id = a.traineeid
 AND t.roundid = a.roundid
 AND a.row_num = 1
WHERE t.__hevo__marked_deleted = false
  AND c.__hevo__marked_deleted = false
  AND c._id = '{{ cohort_id }}'
  AND t.status IN ('수강중', '수료', '중도하차')
ORDER BY
  CASE
    WHEN t.status = '중도하차' THEN 3
    WHEN t.status = '수료' THEN 2
    ELSE 1
  END,
  t.name;
