"""Read the persisted workflow for the authenticated task detail."""

import json


def _step_view(row):
    step = dict(row)
    raw_review = step.pop('review_text')
    verdict = None
    if isinstance(raw_review, str):
        try:
            review = json.loads(raw_review)
        except ValueError:
            review = None
        allowed = ('approve', 'revise', 'discuss') if step['kind'] == 'plan_review' else ('approve', 'revise')
        if isinstance(review, dict) and review.get('verdict') in allowed:
            verdict = review['verdict']
    step['review_verdict'] = verdict
    return step


def task_workflow(connection, task_id):
    pending = connection.execute(
        "SELECT received_at FROM automation_events WHERE task_id=? AND flow_id IS NULL "
        "AND consumed_at IS NULL ORDER BY received_at DESC,id DESC LIMIT 1", (task_id,),
    ).fetchone()
    flows = []
    for row in connection.execute(
        """SELECT id,status,phase,created_at,updated_at,
                  json_extract(attention_json,'$.reason') AS reason,
                  json_extract(context_json,'$.requirement_revision') AS requirement_revision
           FROM automation_flows WHERE task_id=? ORDER BY created_at DESC,rowid DESC""", (task_id,),
    ):
        flow = dict(row)
        flow['steps'] = [_step_view(step) for step in connection.execute(
            """SELECT s.kind,s.status,s.attempt,s.updated_at,
                      CASE WHEN s.kind IN ('plan_review','code_review') AND s.status='completed'
                           THEN json_extract(s.result_json,'$.text') END AS review_text,
                      json_extract(s.result_json,'$.receipt.exit_code') AS exit_code,
                      json_extract(s.result_json,'$.target_sha') AS target_sha,
                      json_extract(s.result_json,'$.target_test_passed') AS target_test_passed,
                      d.id AS delivery_id
               FROM automation_steps s LEFT JOIN task_deliveries d
                 ON d.task_id=? AND d.source='automation_verify' AND d.source_key=s.id
               WHERE s.flow_id=? ORDER BY s.ordinal""", (task_id, row['id']),
        )]
        flow['reviews'] = [dict(review) for review in connection.execute(
            """SELECT r.delivery_id,r.verdict,r.reason,r.created_at
               FROM task_reviews r JOIN task_deliveries d
                 ON d.id=r.delivery_id AND d.task_id=r.task_id
               JOIN automation_steps s ON s.id=d.source_key
               WHERE r.task_id=? AND d.source='automation_verify' AND s.flow_id=?
               ORDER BY r.created_at,r.rowid""", (task_id, row['id']),
        )]
        flows.append(flow)
    return {'pending_since': pending['received_at'] if pending else None, 'flows': flows}
