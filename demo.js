/* 공유용 데모: 서버 없이 제외·포함·승인·발송을 이 페이지 안에서만 흉내 낸다 (tools/build_demo.py가 붙인다).
   상태는 이 탭의 sessionStorage에 이사별로 두므로 다른 이사를 열었다 돌아와도 남고, 탭을 닫으면 사라진다.
   메일은 나가지 않는다. 발송 버튼은 상태와 발송 이력만 바꾼다. */
(function () {
  "use strict";
  var KEY = "board-demo-state";
  var FLASH_KEY = "board-demo-flash";
  var LOCKED_NOTICE = "승인된 정리본은 고칠 수 없습니다. 고치려면 승인을 취소하세요.";
  var SENT_NOTICE = "발송된 정리본은 고칠 수 없습니다. 고치려면 다시 고치기를 누르세요.";
  var NOT_APPROVED = "승인된 정리본만 발송할 수 있습니다";
  var TEST_TO = "me@example.com";
  var MEETING_FILES = {"2026-11-12 사전보고회": "index.html", "2026-11-05 이사회": "meeting-1.html"};
  // board/templates/list.html·briefing.html의 다시 고치기 확인 문구와 같다
  var REOPEN_CONFIRM = "보낸 메일은 회수되지 않습니다. 검토 전으로 돌려 고친 뒤 승인·발송을 다시 할까요? (제외 표시는 그대로입니다)";
  var STATUS = { draft: ["검토 전", "draft"], approved: ["승인", "approved"], sent: ["발송", "sent"] };

  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveState() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();

  // 이사별 상태. 저장된 적 없으면 뽑을 때의 모양(검토 전, 제외는 화면에 그려진 대로)이다
  function entry(id) {
    if (!state[id]) state[id] = { status: "draft", history: [] };
    if (!state[id].history) state[id].history = [];
    return state[id];
  }
  function statusOf(id) { return state[id] ? state[id].status : "draft"; }

  function now() {
    var d = new Date();
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) +
      "T" + two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
  }
  function addHistory(id, kind, to) {
    entry(id).history.unshift({ at: now(), kind: kind, to: to });  // 로컬 웹처럼 최근 것부터
  }
  // 목록의 최종 발송현황: 이사에게 보낸(발송·다시 발송) 마지막 때. 나에게 발송은 넣지 않는다
  function lastSent(id) {
    var h = (state[id] && state[id].history) || [];
    for (var i = 0; i < h.length; i++) {
      if (h[i].kind !== "나에게") return h[i].at;
    }
    return null;
  }

  function setBadge(badge, status) {
    if (!badge) return;
    badge.textContent = STATUS[status][0];
    badge.className = "badge " + STATUS[status][1];
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, demo, cls) {
    var form = el("form");
    var b = el("button", cls || "", text);
    b.type = "submit";
    b.setAttribute("data-demo", demo);
    form.appendChild(b);
    return form;
  }

  // 로컬 웹이 보낸 뒤 띄우는 알림과 같은 모양. 잠시 뒤 사라진다
  function toast(message) {
    var t = el("div", "toast", "✓ " + message);
    t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("hide"); }, 4000);
  }

  function reopen(id) {
    if (!window.confirm(REOPEN_CONFIRM)) return false;
    entry(id).status = "draft";  // 제외 표시와 발송 이력은 그대로
    saveState();
    return true;
  }

  // 목록: 데모에서 바꾼 이사의 발언 수·상태·최종 발송현황을 보인다
  function renderList() {
    document.querySelectorAll("table.list tbody tr").forEach(function (tr) {
      var link = tr.querySelector('a[href^="briefing-"]');
      if (!link) return;
      var id = link.getAttribute("href").match(/briefing-(\d+)/)[1];
      var saved = state[id];
      if (!saved) return;
      // 칸: 이사 · 구분 · 발언(포함 / 전체) · 상태 · 이메일 · 최종 발송현황
      var cells = tr.querySelectorAll("td");
      if (saved.total !== undefined) cells[2].textContent = saved.included + " / " + saved.total;
      setBadge(cells[3].querySelector(".badge"), saved.status);
      var cell = cells[5];
      if (!cell) return;
      cell.textContent = "";
      var at = lastSent(id);
      if (at) cell.appendChild(el("span", "", at.slice(0, 16).replace(/-/g, ".").replace("T", " ") + " 발송완료"));
      else cell.appendChild(el("span", "muted", "발송전"));
      if (saved.status === "sent") {
        var form = button("다시 고치기", "reopen:" + id);
        cell.appendChild(form);
      }
    });
  }

  // 이메일 초안(또는 발송 확인의 미리보기) 틀: 제외한 발언 줄을 숨기고, 발언이 모두 빠진 안건은 단락째 숨겨 번호를 다시 매긴다.
  // 남은 단락 수를 돌려준다 (틀을 아직 못 읽으면 null)
  function hideExcluded(frame, excludedIds) {
    var doc;
    try { doc = frame.contentDocument; } catch (e) { return null; }
    if (!doc || !doc.body) return null;
    var excluded = {};
    excludedIds.forEach(function (x) { excluded[x] = true; });
    doc.querySelectorAll("tr[data-item]").forEach(function (tr) {
      tr.style.display = excluded[tr.getAttribute("data-item")] ? "none" : "";
    });
    var seq = 0;
    doc.querySelectorAll('tr[data-role="head"]').forEach(function (head) {
      var n = head.getAttribute("data-section");
      var visible = Array.prototype.some.call(
        doc.querySelectorAll('tr[data-section="' + n + '"] tr[data-item]'),
        function (tr) { return tr.style.display !== "none"; }
      );
      doc.querySelectorAll('tr[data-section="' + n + '"]').forEach(function (tr) {
        tr.style.display = visible ? "" : "none";
      });
      if (visible) {
        seq += 1;
        var cell = head.firstElementChild;
        cell.textContent = cell.textContent.replace(/^\d+\./, seq + ".");
      }
    });
    if (typeof fitReport === "function") fitReport(frame);
    return seq;
  }

  // 모든 화면 공통: 대상 회의 고르기와 목록의 다시 고치기
  document.addEventListener("submit", function (e) {
    var form = e.target;
    var btn = form.querySelector("button");
    var demo = btn ? btn.getAttribute("data-demo") : null;
    if (form.classList.contains("filter")) {
      // 로컬 웹은 ?meeting= 으로 서버가 그리지만, 데모는 회의마다 뽑아 둔 목록 파일로 간다
      e.preventDefault();
      e.stopImmediatePropagation();
      var select = form.querySelector('select[name="meeting"]');
      location.href = (select && MEETING_FILES[select.value]) || "index.html";
    } else if (demo && demo.indexOf("reopen:") === 0 && !(detail && detail.contains(form))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var target = demo.slice(7);
      if (!reopen(target)) return;
      // 열려 있는 정리본을 목록에서 다시 고쳤으면 정리본 화면도 새로 그린다
      if (detail && location.pathname.indexOf("briefing-" + target + ".html") >= 0) location.reload();
      else renderList();
    }
  }, true);

  var detail = document.getElementById("detail");
  var confirmCard = document.querySelector(".card.confirm");
  if (confirmCard) {
    setupConfirm();
    return;
  }
  if (!detail) {
    renderList();
    return;
  }

  /* ---------- 발송 확인 화면 (send-<id>.html) ---------- */
  function setupConfirm() {
    var id = (location.pathname.match(/send-(\d+)\.html/) || [])[1];
    var status = statusOf(id);
    var heading = confirmCard.querySelector("h2");
    if (status === "sent") {
      heading.textContent = "다시 발송 확인";
      document.title = document.title.replace("발송 확인", "다시 발송 확인");
    }
    var actions = confirmCard.querySelector(".actions");
    if (status === "draft") {
      // 로컬 웹이 보낼 수 없을 때 보이는 모양: 이유와 정리본으로 가는 링크만
      var notice = el("p", "notice", NOT_APPROVED);
      actions.parentNode.insertBefore(notice, actions);
      actions.querySelector("form").remove();
      actions.querySelector("a").textContent = "정리본으로";
    }
    var frame = confirmCard.querySelector("iframe");
    var excluded = (state[id] && state[id].excluded) || null;
    function hide() {
      // 저장된 적 없으면 뽑을 때의 제외(이메일 초안 틀에는 다 들어 있다)를 정리본 화면에서 알 수 없으니 그대로 보인다
      if (excluded) hideExcluded(frame, excluded);
    }
    frame.addEventListener("load", hide);
    hide();
    document.addEventListener("submit", function (e) {
      if (!confirmCard.contains(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var name = (confirmCard.querySelector("td") || {}).textContent || "";
      addHistory(id, statusOf(id) === "sent" ? "다시 발송" : "발송", (name.match(/<([^>]+)>/) || [])[1] || "");
      entry(id).status = "sent";
      saveState();
      try { sessionStorage.setItem(FLASH_KEY, name.replace(/\s*<.*$/, "") + " 이사에게 보냈습니다"); } catch (err) {}
      location.href = "briefing-" + id + ".html#detail";
    }, true);
  }

  /* ---------- 정리본 화면 (briefing-<id>.html) ---------- */
  var id = (location.pathname.match(/briefing-(\d+)\.html/) || [])[1];
  var remarks = detail.querySelector(".remarks");
  var items = [];
  detail.querySelectorAll(".remarks li").forEach(function (li) {
    var form = li.querySelector("form.item");
    if (!form) return;
    var txt = li.querySelector(".txt");
    var strike = txt.querySelector("s");
    var mark = el("span", "muted demo-lock", "제외됨");
    li.appendChild(mark);
    items.push({
      id: form.getAttribute("action").match(/\/items\/(\d+)\//)[1],
      txt: txt,
      html: strike ? strike.innerHTML : txt.innerHTML,
      button: form.querySelector("button"),
      ambiguous: !!li.querySelector(".badge.ambiguous"),
      excluded: !!strike,
      mark: mark
    });
  });

  var saved = state[id];
  if (saved && saved.excluded) {
    items.forEach(function (it) { it.excluded = saved.excluded.indexOf(it.id) >= 0; });
  }

  // 잠금 안내 (승인: 승인 취소 / 발송: 다시 고치기). 로컬 웹은 서버가 잠긴 화면을 따로 그린다
  var lock = el("div", "notice locked demo-lock");
  var lockText = el("span");
  var lockButtons = el("span");
  lockButtons.style.display = "contents";  // 로컬 웹처럼 버튼이 안내 옆 줄에 놓이게 감싼 칸은 배치에서 빠진다
  lock.appendChild(lockText);
  lock.appendChild(lockButtons);
  remarks.insertBefore(lock, remarks.firstChild);
  var bottom = remarks.querySelector(".actions");
  var bottomLock = null;
  if (bottom) {
    bottom.classList.add("demo-edit");
    bottomLock = el("div", "actions demo-lock");
    remarks.appendChild(bottomLock);
  }

  // 발송 막대: 나에게 발송은 늘 있고, 승인·발송이면 발송·다시 발송 링크를 더한다
  var sendBar = detail.querySelector(".pane-title .send");
  var sendLink = el("a", "button primary");
  sendLink.href = "send-" + id + ".html";
  if (sendBar) sendBar.appendChild(sendLink);

  var historyCard = detail.querySelector(".card.history");

  function renderHistory() {
    if (!historyCard) return;
    var h = (state[id] && state[id].history) || [];
    var old = historyCard.querySelector("table, p.muted");
    if (old) old.remove();
    if (!h.length) {
      historyCard.appendChild(el("p", "muted", "아직 보낸 적이 없습니다"));
      return;
    }
    var table = el("table", "list");
    table.innerHTML = "<thead><tr><th>일시</th><th>종류</th><th>받는 주소</th><th>결과</th></tr></thead><tbody></tbody>";
    var body = table.querySelector("tbody");
    h.forEach(function (r) {
      var tr = el("tr");
      [r.at.replace("T", " "), r.kind, r.to, "성공"].forEach(function (v) { tr.appendChild(el("td", "", v)); });
      body.appendChild(tr);
    });
    historyCard.appendChild(table);
  }

  var frame = document.getElementById("report");
  var preview = frame.parentNode;
  var empty = preview.querySelector("p.notice");
  if (!empty) {
    empty = el("p", "notice", "리포트에 들어갈 발언이 없습니다");
    preview.insertBefore(empty, preview.firstChild);
  }
  function renderReport() {
    var seq = hideExcluded(frame, items.filter(function (it) { return it.excluded; }).map(function (it) { return it.id; }));
    if (seq !== null) empty.hidden = seq > 0;
  }

  function render() {
    var status = statusOf(id);
    var count = { total: items.length, included: 0 };
    items.forEach(function (it) {
      it.txt.innerHTML = it.excluded ? "<s>" + it.html + "</s>" : it.html;
      it.button.textContent = it.excluded ? "포함" : "제외";
      it.button.className = it.excluded ? "include" : "exclude";
      it.mark.hidden = !it.excluded;
      if (!it.excluded) count.included += 1;
    });
    detail.classList.toggle("demo-locked", status !== "draft");
    setBadge(detail.querySelector(".head .badge"), status);
    lockText.textContent = status === "sent" ? SENT_NOTICE : LOCKED_NOTICE;
    lockButtons.textContent = "";
    lockButtons.appendChild(status === "sent" ? button("다시 고치기", "reopen:" + id) : button("승인 취소", "unapprove"));
    if (bottomLock) {
      bottomLock.textContent = "";
      if (status === "approved") bottomLock.appendChild(button("승인 취소", "unapprove"));
    }
    sendLink.textContent = status === "sent" ? "다시 발송" : "발송";
    sendLink.style.display = status === "draft" ? "none" : "";  // a.button의 display가 hidden 속성을 이긴다
    var e = entry(id);
    e.excluded = items.filter(function (it) { return it.excluded; }).map(function (it) { return it.id; });
    e.total = count.total;
    e.included = count.included;
    renderList();
    renderReport();
    renderHistory();
  }

  // 정리본 폼은 서버로 보내지 않고 화면만 바꾼다. 로컬 웹의 "보던 자리 기억" 스크립트도 돌지 않게 먼저 가로챈다
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!detail.contains(form)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var action = form.querySelector("button").getAttribute("data-demo") || form.getAttribute("action") || "";
    var match = action.match(/\/items\/(\d+)\//);
    if (match) {
      items.forEach(function (it) { if (it.id === match[1]) it.excluded = !it.excluded; });
    } else if (/exclude-ambiguous$/.test(action)) {
      items.forEach(function (it) { if (it.ambiguous) it.excluded = true; });
    } else if (/include-ambiguous$/.test(action)) {
      items.forEach(function (it) { if (it.ambiguous) it.excluded = false; });
    } else if (action === "unapprove") {
      entry(id).status = "draft";
    } else if (action.indexOf("reopen:") === 0) {
      if (!reopen(id)) return;
    } else if (/\/approve$/.test(action)) {
      entry(id).status = "approved";
    } else if (/\/send-test$/.test(action)) {
      addHistory(id, "나에게", TEST_TO);
      toast(TEST_TO + "로 보냈습니다");
    }
    render();
    saveState();
  }, true);

  frame.addEventListener("load", renderReport);
  render();
  saveState();
  var flash = null;
  try { flash = sessionStorage.getItem(FLASH_KEY); sessionStorage.removeItem(FLASH_KEY); } catch (err) {}
  if (flash) toast(flash);
})();
