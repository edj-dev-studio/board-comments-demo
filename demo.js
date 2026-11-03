/* 공유용 데모: 서버 없이 제외·포함·승인을 이 페이지 안에서만 흉내 낸다 (tools/build_demo.py가 붙인다).
   상태는 이 탭의 sessionStorage에 이사별로 두므로 다른 이사를 열었다 돌아와도 남고, 탭을 닫으면 사라진다. */
(function () {
  "use strict";
  var KEY = "board-demo-state";
  var LOCKED_NOTICE = "승인된 정리본은 고칠 수 없습니다. 고치려면 승인을 취소하세요.";
  var MEETING_FILES = {"2026-11-12 사전보고회": "index.html", "2026-11-05 이사회": "meeting-1.html"};

  // 대상 회의 고르기: 로컬 웹은 ?meeting= 으로 서버가 그리지만, 데모는 회의마다 뽑아 둔 목록 파일로 간다
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.classList.contains("filter")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var select = form.querySelector('select[name="meeting"]');
    location.href = (select && MEETING_FILES[select.value]) || "index.html";
  }, true);

  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveState() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();

  function setBadge(badge, approved) {
    if (!badge) return;
    badge.textContent = approved ? "승인" : "검토 전";
    badge.className = "badge " + (approved ? "approved" : "draft");
  }

  // 목록: 데모에서 바꾼 이사의 발언 수와 상태를 보인다
  function renderList() {
    document.querySelectorAll("table.list tbody tr").forEach(function (tr) {
      var link = tr.querySelector('a[href^="briefing-"]');
      if (!link) return;
      var saved = state[link.getAttribute("href").match(/briefing-(\d+)/)[1]];
      if (!saved) return;
      // 칸: 이사 · 구분 · 발언(포함 / 전체) · 상태 · 이메일
      var cells = tr.querySelectorAll("td");
      cells[2].textContent = saved.included + " / " + saved.total;
      setBadge(cells[3].querySelector(".badge"), saved.approved);
    });
  }

  var detail = document.getElementById("detail");
  if (!detail) {
    renderList();
    return;
  }

  var id = (location.pathname.match(/briefing-(\d+)\.html/) || [])[1];
  var remarks = detail.querySelector(".remarks");
  var items = [];
  detail.querySelectorAll(".remarks li").forEach(function (li) {
    var form = li.querySelector("form.item");
    if (!form) return;
    var txt = li.querySelector(".txt");
    var strike = txt.querySelector("s");
    var mark = document.createElement("span");
    mark.className = "muted demo-lock";
    mark.textContent = "제외됨";
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
  if (saved) {
    items.forEach(function (it) { it.excluded = saved.excluded.indexOf(it.id) >= 0; });
  }
  var approved = saved ? saved.approved : false;

  // 승인 뒤 안내와 승인 취소 버튼 (로컬 웹은 서버가 승인된 화면을 따로 그린다)
  function unapproveForm() {
    return '<form><button type="submit" data-demo="unapprove">승인 취소</button></form>';
  }
  var lock = document.createElement("div");
  lock.className = "notice locked demo-lock";
  lock.innerHTML = "<span></span>" + unapproveForm();
  lock.querySelector("span").textContent = LOCKED_NOTICE;
  remarks.insertBefore(lock, remarks.firstChild);
  var bottom = remarks.querySelector(".actions");
  if (bottom) {
    bottom.classList.add("demo-edit");
    var bottomLock = document.createElement("div");
    bottomLock.className = "actions demo-lock";
    bottomLock.innerHTML = unapproveForm();
    remarks.appendChild(bottomLock);
  }

  // 이메일 초안: 제외한 발언 줄을 숨기고, 발언이 모두 빠진 안건은 단락째 숨겨 번호를 다시 매긴다
  var frame = document.getElementById("report");
  var preview = frame.parentNode;
  var empty = preview.querySelector("p.notice");
  if (!empty) {
    empty = document.createElement("p");
    empty.className = "notice";
    empty.textContent = "리포트에 들어갈 발언이 없습니다";
    preview.insertBefore(empty, preview.firstChild);
  }
  function renderReport() {
    var doc;
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    var excluded = {};
    items.forEach(function (it) { if (it.excluded) excluded[it.id] = true; });
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
    empty.hidden = seq > 0;
    if (typeof fitReport === "function") fitReport(frame);
  }

  function render() {
    var count = { total: items.length, included: 0 };
    items.forEach(function (it) {
      it.txt.innerHTML = it.excluded ? "<s>" + it.html + "</s>" : it.html;
      it.button.textContent = it.excluded ? "포함" : "제외";
      it.button.className = it.excluded ? "include" : "exclude";
      it.mark.hidden = !it.excluded;
      if (!it.excluded) count.included += 1;
    });
    detail.classList.toggle("demo-locked", approved);
    setBadge(detail.querySelector(".head .badge"), approved);
    state[id] = {
      excluded: items.filter(function (it) { return it.excluded; }).map(function (it) { return it.id; }),
      approved: approved,
      total: count.total,
      included: count.included
    };
    renderList();
    renderReport();
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
      approved = false;
    } else if (/\/approve$/.test(action)) {
      approved = true;
    }
    render();
    saveState();
  }, true);

  frame.addEventListener("load", renderReport);
  render();
})();
