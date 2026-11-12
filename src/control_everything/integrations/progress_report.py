"""Render GitHub facts without treating merges or closures as human acceptance."""

from datetime import datetime, timedelta, timezone
import unicodedata


SHANGHAI = timezone(timedelta(hours=8))
REVIEW = {"APPROVED": "已批准", "CHANGES_REQUESTED": "要求修改", "REVIEW_REQUIRED": "待评审"}
FAILED_CHECKS = {"FAILURE", "ERROR"}


def _text(value):
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = "".join(char for char in text if char == "\n" or not unicodedata.category(char).startswith("C"))
    text = text.replace("<", "＜").replace(">", "＞")
    return " ".join(text.split())


def _owners(item):
    if item["kind"] == "pr" and item.get("author"):
        return [item["author"]]
    return sorted(set(item.get("owners") or [])) or ["未认领"]


def _names(values):
    return "、".join(_text(value) for value in sorted(set(values))) or "无待审请求"


def _label(item):
    kind = "PR" if item["kind"] == "pr" else "Issue"
    role = "作者" if item["kind"] == "pr" else "负责人"
    people = _owners(item)
    shared = "，共同负责" if len(people) > 1 else ""
    return f'{kind} #{item["number"]} {_text(item["title"])}（{role}：{_names(people)}{shared}）'


def _stamp(value):
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=SHANGHAI) if parsed.tzinfo is None else parsed.astimezone(SHANGHAI)


def _local(now):
    return now.replace(tzinfo=SHANGHAI) if now.tzinfo is None else now.astimezone(SHANGHAI)


def changes(previous: list[dict], current: list[dict], now: datetime) -> list[str]:
    """Return one event per changed item; a missing item is never inferred completed."""
    before = {item["id"]: item for item in previous}
    result = []
    for item in sorted(current, key=lambda value: (value["kind"], value["number"])):
        old = before.get(item["id"])
        notes = []
        if old is None:
            notes.append("新增记录；当前状态：" + _text(item["state"]))
        else:
            if item["state"] != old["state"]:
                if item["state"] == "OPEN":
                    notes.append("重新打开")
                elif item["kind"] == "pr":
                    notes.append("已合并（验收、发布另计）" if item["state"] == "MERGED" else "已关闭未合并")
                else:
                    reasons = {"COMPLETED": "标记完成；人工验收另计", "NOT_PLANNED": "不再计划，不计完成"}
                    notes.append("已关闭（" + reasons.get(item.get("state_reason"), "原因未记录，不计完成") + "）")
            elif item["kind"] == "issue" and item["state"] == "CLOSED" and item.get("state_reason") != old.get("state_reason"):
                notes.append("关闭原因更新：" + _text(old.get("state_reason") or "未记录") + " → " + _text(item.get("state_reason") or "未记录"))
            for field, title in (("status", "看板状态"), ("next_step", "下一步")):
                if (item.get(field) or "") != (old.get(field) or ""):
                    notes.append(f'{title}：{_text(old.get(field)) or "未设置"} → {_text(item.get(field)) or "未设置"}')
            if _owners(item) != _owners(old):
                notes.append("负责人：" + _names(_owners(old)) + " → " + _names(_owners(item)))
            if item["kind"] == "pr" and item["state"] == "OPEN":
                if bool(item.get("is_draft")) != bool(old.get("is_draft")):
                    notes.append("转为草稿" if item.get("is_draft") else "已转为可审查")
                if set(item.get("reviewers") or []) != set(old.get("reviewers") or []):
                    notes.append("待审人：" + _names(old.get("reviewers") or []) + " → " + _names(item.get("reviewers") or []))
                if item.get("review_decision") != old.get("review_decision"):
                    notes.append("审查结论：" + REVIEW.get(item.get("review_decision"), "未提供"))
                if item.get("checks") != old.get("checks"):
                    if item.get("checks") in FAILED_CHECKS:
                        notes.append("检查失败（" + item["checks"] + "）")
                    elif old.get("checks") in FAILED_CHECKS and item.get("checks") == "SUCCESS":
                        notes.append("检查恢复成功")
        if notes:
            result.append(_label(item) + "：" + "；".join(notes) + "\n" + _text(item["url"]))
    return result


def _weekly_done(item, start, now):
    if item["kind"] == "pr":
        stamp = _stamp(item.get("merged_at")) if item["state"] == "MERGED" else None
    else:
        stamp = _stamp(item.get("closed_at")) if item["state"] == "CLOSED" and item.get("state_reason") == "COMPLETED" else None
    return stamp is not None and start <= stamp <= now


def _blocked(item):
    return item.get("review_decision") == "CHANGES_REQUESTED" or item.get("checks") in FAILED_CHECKS or item.get("status") == "阻塞"


def _details(item, now):
    if item["kind"] == "pr":
        parts = ["草稿" if item.get("is_draft") else REVIEW.get(item.get("review_decision"), "审查结论未提供")]
        if item.get("reviewers"):
            parts.append("待审人：" + _names(item["reviewers"]))
        if item.get("checks") in FAILED_CHECKS:
            parts.append("检查失败（" + item["checks"] + "）")
    else:
        parts = ["看板：" + _text(item.get("status") or "未设置")]
        if item["state"] == "OPEN" and item.get("status") == "已完成":
            parts.append("看板已完成，Issue 仍打开")
        updated = _stamp(item.get("updated_at"))
        if updated and now - updated >= timedelta(hours=48) and item.get("status") not in ("审查／验收", "已完成"):
            parts.append("GitHub 记录 48 小时未更新")
    if item.get("next_step"):
        parts.append("下一步：" + _text(item["next_step"]))
    return "；".join(parts)


def daily(items: list[dict], now: datetime) -> str:
    """Group current work and this week's completion facts by recorded responsibility."""
    now = _local(now)
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    deferred = [item for item in items if item["state"] == "OPEN" and (item.get("archived") or item.get("priority") == "以后再做")]
    active = [item for item in items if item["state"] == "OPEN" and item not in deferred and item.get("status") != "待整理"]
    completed = [item for item in items if _weekly_done(item, start, now)]
    waiting = [item for item in active if item["kind"] == "pr" and not item.get("is_draft")]
    people = set(person for item in active + completed for person in _owners(item))
    people.update(person for item in waiting for person in item.get("reviewers") or [])
    issue_done = sum(item["kind"] == "issue" for item in completed)
    pr_done = sum(item["kind"] == "pr" for item in completed)
    lines = [f'项目进度日报 · {now:%Y-%m-%d %H:%M}（北京时间）',
             f'本周标记完成 Issue {issue_done}，已合并 PR {pr_done}。']
    for person in sorted(people):
        owned = [item for item in active if person in _owners(item)]
        done = [item for item in completed if person in _owners(item)]
        requested = [item for item in waiting if person in (item.get("reviewers") or [])]
        lines.extend(["", _text(person),
                      f'进行中 Issue {sum(item["kind"] == "issue" for item in owned)}、PR {sum(item["kind"] == "pr" for item in owned)}；'
                      f'阻塞 {sum(_blocked(item) for item in owned)}；'
                      f'本周标记完成 Issue {sum(item["kind"] == "issue" for item in done)}，已合并 PR {sum(item["kind"] == "pr" for item in done)}。'])
        for item in sorted(owned, key=lambda value: (value.get("priority") != "优先处理", value["kind"], value["number"])):
            lines.extend(["- " + _label(item) + "：" + _details(item, now), _text(item["url"])])
        if requested:
            lines.append("待我评审：")
            lines.extend("- " + _label(item) + " " + _text(item["url"]) for item in requested)
        if done:
            lines.append("本周结果：")
            for item in done:
                status = "已合并；验收、发布另计" if item["kind"] == "pr" else "Issue 标记完成；人工验收另计"
                if item.get("status") and item["status"] != "已完成":
                    status += "；看板仍为" + _text(item["status"])
                lines.extend(["- " + _label(item) + "：" + status, _text(item["url"])])
    if not people:
        lines.append("暂无进行中事项或本周完成记录。")
    if deferred:
        lines.append(f'延期或归档 {len(deferred)} 项未列入当前计划。')
    lines.append("数据来自 GitHub 记录；合并、验收和发布分别记录。")
    return "\n".join(lines)
