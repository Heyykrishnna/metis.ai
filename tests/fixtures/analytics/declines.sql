SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
WHERE current.year = 2025 AND previous.year = 2024
AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
AND current.enrolled < previous.enrolled
ORDER BY current.school_id;
