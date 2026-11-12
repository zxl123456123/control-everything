"""Progress reports distinguish repository facts from acceptance and delivery."""

from copy import deepcopy
from datetime import datetime, timezone
import unittest

from control_everything.integrations.progress_report import changes, daily


NOW = datetime(2026, 11, 12, 10, 30, tzinfo=timezone.utc)


def issue(number=1, **values):
    item = {"id": f"issue:{number}", "kind": "issue", "number": number,
            "title": "修复连接", "url": f"https://github.com/example/project/issues/{number}",
            "state": "OPEN", "state_reason": None, "author": "creator", "owners": ["alice"],
            "status": "开发中", "priority": "优先处理", "next_step": "补实际验证",
            "updated_at": "2026-11-12T08:00:00Z", "closed_at": None}
    return {**item, **values}


def pr(number=2, **values):
    item = {**issue(number), "id": f"pr:{number}", "kind": "pr", "author": "alice",
            "url": f"https://github.com/example/project/pull/{number}", "owners": ["alice"],
            "status": "审查／验收", "reviewers": ["bob"], "review_decision": "REVIEW_REQUIRED",
            "checks": "SUCCESS", "is_draft": False, "merged_at": None}
    return {**item, **values}


class ChangeTests(unittest.TestCase):
    def event(self, before, after):
        result = changes([before], [after], NOW)
        self.assertEqual(len(result), 1)
        self.assertIn(after["url"], result[0])
        return result[0]

    def test_issue_completion_and_cancellation_are_different(self):
        before = issue()
        completed = self.event(before, issue(state="CLOSED", state_reason="COMPLETED"))
        cancelled = self.event(before, issue(state="CLOSED", state_reason="NOT_PLANNED"))
        self.assertIn("标记完成", completed)
        self.assertIn("人工验收另计", completed)
        self.assertIn("不再计划", cancelled)
        self.assertIn("不计完成", cancelled)

    def test_closed_without_reason_is_not_a_completion(self):
        text = self.event(issue(), issue(state="CLOSED"))
        self.assertIn("原因未记录", text)
        self.assertNotIn("标记完成", text)

    def test_reopened_issue_is_reported(self):
        text = self.event(issue(state="CLOSED", state_reason="COMPLETED"), issue())
        self.assertIn("重新打开", text)

    def test_merged_and_closed_unmerged_prs_are_different(self):
        merged = self.event(pr(), pr(state="MERGED", merged_at="2026-11-12T09:00:00Z"))
        closed = self.event(pr(), pr(state="CLOSED", closed_at="2026-11-12T09:00:00Z"))
        self.assertIn("已合并", merged)
        self.assertIn("验收、发布另计", merged)
        self.assertIn("关闭未合并", closed)

    def test_metadata_does_not_reannounce_historical_completion(self):
        before = issue(state="CLOSED", state_reason="COMPLETED", status="已完成")
        after = {**before, "owners": ["bob"]}
        text = self.event(before, after)
        self.assertIn("负责人", text)
        self.assertNotIn("标记完成", text)

    def test_status_owner_and_next_step_changes_are_batched_per_item(self):
        text = self.event(issue(), issue(status="审查／验收", owners=["bob"], next_step="请评审"))
        for expected in ("看板状态", "负责人", "下一步", "bob", "请评审"):
            self.assertIn(expected, text)

    def test_updated_time_only_and_disappearance_do_not_notify(self):
        item = issue()
        self.assertEqual(changes([item], [{**item, "updated_at": "2026-11-12T10:00:00Z"}], NOW), [])
        self.assertEqual(changes([item], [], NOW), [])

    def test_owner_and_reviewer_order_only_does_not_notify(self):
        item = issue(owners=["alice", "bob"])
        self.assertEqual(changes([item], [{**item, "owners": ["bob", "alice"]}], NOW), [])
        item = pr(reviewers=["bob", "carol"])
        self.assertEqual(changes([item], [{**item, "reviewers": ["carol", "bob"]}], NOW), [])

    def test_review_requests_and_changes_requested_are_visible(self):
        text = self.event(pr(), pr(reviewers=["carol"], review_decision="CHANGES_REQUESTED"))
        self.assertIn("待审人", text)
        self.assertIn("carol", text)
        self.assertIn("要求修改", text)

    def test_draft_becoming_reviewable_is_reported(self):
        text = self.event(pr(is_draft=True), pr(is_draft=False))
        self.assertIn("转为可审查", text)

    def test_check_failure_and_recovery_are_reported(self):
        self.assertIn("检查失败", self.event(pr(), pr(checks="FAILURE")))
        self.assertIn("检查恢复成功", self.event(pr(checks="ERROR"), pr(checks="SUCCESS")))

    def test_new_item_is_a_new_record_not_inferred_completion(self):
        item = issue(state="CLOSED", state_reason="COMPLETED")
        text = changes([], [item], NOW)[0]
        self.assertIn("新增记录", text)
        self.assertNotIn("新完成", text)

    def test_external_text_cannot_create_mentions_or_control_sequences(self):
        item = issue(title='修复\n<at user_id="all">所有人</at>\x00\u202e',
                     next_step='继续\x1b<at user_id="all">')
        text = self.event(issue(), item)
        self.assertNotIn("<", text)
        self.assertNotIn(">", text)
        self.assertNotIn("\x00", text)
        self.assertNotIn("\x1b", text)
        self.assertNotIn("\u202e", text)
        self.assertIn("修复 ＜at", text)


class DailyTests(unittest.TestCase):
    def test_ownership_pending_reviews_and_next_step_are_explicit(self):
        text = daily([issue(owners=["alice", "bob"]), pr(author="carol", owners=["alice"])], NOW)
        for expected in ("alice", "bob", "carol", "共同负责", "下一步：补实际验证", "待我评审", "PR #2"):
            self.assertIn(expected, text)
        carol = text.split("carol", 1)[1]
        self.assertIn("PR #2", carol)
        self.assertIn("合并、验收和发布分别记录", text)

    def test_cancelled_and_closed_unmerged_do_not_count_as_weekly_completions(self):
        items = [issue(state="CLOSED", state_reason="NOT_PLANNED", closed_at="2026-11-12T09:00:00Z"),
                 pr(state="CLOSED", closed_at="2026-11-12T09:00:00Z")]
        text = daily(items, NOW)
        self.assertIn("本周标记完成 Issue 0", text)
        self.assertIn("已合并 PR 0", text)

    def test_week_boundary_uses_shanghai_and_excludes_future_timestamps(self):
        items = [issue(1, state="CLOSED", state_reason="COMPLETED", closed_at="2026-11-08T16:01:00Z"),
                 issue(2, state="CLOSED", state_reason="COMPLETED", closed_at="2026-11-08T15:59:00Z"),
                 issue(3, state="CLOSED", state_reason="COMPLETED", closed_at="2026-11-12T11:00:00Z"),
                 pr(state="MERGED", merged_at="2026-11-12T08:00:00Z")]
        text = daily(items, NOW)
        self.assertIn("2026-11-12 18:30", text)
        self.assertIn("本周标记完成 Issue 1", text)
        self.assertIn("已合并 PR 1", text)
        self.assertIn("Issue #1", text)
        self.assertNotIn("Issue #2", text)
        self.assertNotIn("Issue #3", text)

    def test_unowned_items_have_their_own_group(self):
        text = daily([issue(owners=[])], NOW)
        self.assertIn("未认领", text)
        self.assertIn("Issue #1", text)

    def test_missing_optional_fields_still_produces_a_report(self):
        item = {"id": "issue:1", "kind": "issue", "number": 1, "title": "记录",
                "url": "https://github.com/example/project/issues/1", "state": "OPEN"}
        text = daily([item], NOW)
        self.assertIn("未认领", text)
        self.assertIn("看板：未设置", text)

    def test_stale_label_does_not_apply_to_deferred_or_archived_work(self):
        old = "2026-11-01T08:00:00Z"
        text = daily([issue(1, updated_at=old), issue(2, updated_at=old, priority="以后再做"),
                      issue(3, updated_at=old, archived=True)], NOW)
        self.assertIn("48 小时未更新", text)
        self.assertNotIn("Issue #2", text)
        self.assertNotIn("Issue #3", text)
        self.assertNotIn("没工作", text)
        self.assertIn("延期或归档 2 项", text)

    def test_blockers_and_board_state_discrepancies_are_visible(self):
        items = [issue(status="已完成"), pr(review_decision="CHANGES_REQUESTED", checks="FAILURE")]
        text = daily(items, NOW)
        for expected in ("Issue 仍打开", "看板已完成", "要求修改", "检查失败", "阻塞"):
            self.assertIn(expected, text)

    def test_inputs_are_not_modified_and_text_is_sanitized(self):
        items = [issue(title='<at user_id="all">标题</at>', next_step="验证\x00<done>")]
        original = deepcopy(items)
        text = daily(items, NOW)
        self.assertEqual(items, original)
        self.assertNotIn("<", text)
        self.assertNotIn("\x00", text)


if __name__ == "__main__":
    unittest.main()
