(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyBTtmZhxAEihOxupnwj1vZah3I9F0dKqws",
    authDomain: "vocabularyapp-90ce6.firebaseapp.com",
    projectId: "vocabularyapp-90ce6",
    storageBucket: "vocabularyapp-90ce6.firebasestorage.app",
    messagingSenderId: "262794086618",
    appId: "1:262794086618:web:33021b7bcc79b944f4fde3",
    measurementId: "G-P8RK8BEEWC"
  };

  const columns = [
    { key: "Từ", checkbox: "showWord" },
    { key: "Phiên âm", checkbox: "showPron" },
    { key: "Loại từ", checkbox: "showPos" },
    { key: "Nghĩa", checkbox: "showMeaning" }
  ];

  const STORAGE_VERSION = "v2";

  let originalData = [];
  let currentData = [];
  let rowMap = new Map();

  let currentUser = null;
  let progressCache = {};
  let manualKnownCache = {};
  let isLoadingCloud = false;

  firebase.initializeApp(firebaseConfig);

  const auth = firebase.auth();
  const db = firebase.firestore();
  const googleProvider = new firebase.auth.GoogleAuthProvider();

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    [
      "fileInput", "shuffleBtn", "restoreBtn", "gradeBtn", "resetBtn",
      "loginBtn", "logoutBtn", "userChip", "userPhoto", "userName",
      "authStatus", "syncStatus", "showWord", "showPron", "showPos",
      "showMeaning", "quizColumn", "progressFilter", "vocabTable",
      "scoreBox", "status"
    ].forEach(id => {
      els[id] = document.getElementById(id);
    });

    els.fileInput.addEventListener("change", handleFile);
    els.shuffleBtn.addEventListener("click", shuffleWords);
    els.restoreBtn.addEventListener("click", restoreOriginal);
    els.gradeBtn.addEventListener("click", grade);
    els.resetBtn.addEventListener("click", resetProgress);
    els.loginBtn.addEventListener("click", loginWithGoogle);
    els.logoutBtn.addEventListener("click", logoutGoogle);

    [els.showWord, els.showPron, els.showPos, els.showMeaning]
      .forEach(el => el.addEventListener("change", renderTable));

    els.quizColumn.addEventListener("change", renderTable);
    els.progressFilter.addEventListener("change", renderTable);

    auth.onAuthStateChanged(handleAuthStateChanged);

    loadLocalCache();
    renderTable();
  }

  /* -----------------------------
     LOCAL STORAGE
  ----------------------------- */

  function storageScope() {
    return currentUser ? currentUser.uid : "guest";
  }

  function progressStorageKey() {
    return `vocabulary_progress_${STORAGE_VERSION}_${storageScope()}`;
  }

  function manualStorageKey() {
    return `vocabulary_manual_known_${STORAGE_VERSION}_${storageScope()}`;
  }

  function loadLocalCache() {
    progressCache = readJson(progressStorageKey());
    manualKnownCache = readJson(manualStorageKey());
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      return {};
    }
  }

  function saveProgressCache() {
    localStorage.setItem(progressStorageKey(), JSON.stringify(progressCache));
  }

  function saveManualCache() {
    localStorage.setItem(manualStorageKey(), JSON.stringify(manualKnownCache));
  }

  /* -----------------------------
     DATA / STATUS LOGIC
  ----------------------------- */

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFC")
      .replace(/\s+/g, " ");
  }

  function makeWordKey(row) {
    return [
      normalizeText(row["Từ"]),
      normalizeText(row["Phiên âm"]),
      normalizeText(row["Loại từ"]),
      normalizeText(row["Nghĩa"])
    ].join("||");
  }

  function rebuildRowMap() {
    rowMap = new Map();

    for (const row of originalData) {
      rowMap.set(makeWordKey(row), row);
    }
  }

  function getWordProgress(row) {
    return progressCache[makeWordKey(row)] || {};
  }

  function isManuallyKnown(row) {
    return manualKnownCache[makeWordKey(row)] === true;
  }

  function hasAnyCorrectAnswer(row) {
    return Object.values(getWordProgress(row)).some(value => value === true);
  }

  // Trạng thái khi đang kiểm tra một cột cụ thể.
  function isKnownForQuiz(row, quizColumn) {
    return isManuallyKnown(row) ||
      getWordProgress(row)[quizColumn] === true;
  }

  // Trạng thái tổng hợp khi chọn "Không kiểm tra".
  // Đây là phần sửa lỗi chính:
  // Đã thuộc nếu đánh dấu thủ công HOẶC từng đúng ở BẤT KỲ bài kiểm tra nào.
  function isKnownOverall(row) {
    return isManuallyKnown(row) || hasAnyCorrectAnswer(row);
  }

  function isKnownInCurrentMode(row) {
    const quiz = getQuizColumn();
    return quiz ? isKnownForQuiz(row, quiz) : isKnownOverall(row);
  }

  async function setKnownFromCheckbox(row, checked) {
    const key = makeWordKey(row);
    const quiz = getQuizColumn();

    if (checked) {
      // Tick thủ công = thuộc từ này trong mọi chế độ.
      manualKnownCache[key] = true;
    } else {
      // Bỏ tick phải làm trạng thái thực sự về "Chưa thuộc".
      delete manualKnownCache[key];

      if (!progressCache[key]) {
        progressCache[key] = {};
      }

      if (quiz) {
        // Nếu đang kiểm tra một nội dung, chỉ reset nội dung đó.
        progressCache[key][quiz] = false;
      } else {
        // Nếu đang "Không kiểm tra", reset toàn bộ lịch sử đúng của từ.
        for (const field of Object.keys(progressCache[key])) {
          progressCache[key][field] = false;
        }
      }
    }

    saveManualCache();
    saveProgressCache();

    await syncWordToCloud(row);
  }

  async function markKnown(row, quizColumn) {
    const key = makeWordKey(row);

    if (!progressCache[key]) {
      progressCache[key] = {};
    }

    progressCache[key][quizColumn] = true;
    saveProgressCache();

    await syncWordToCloud(row);
  }

  async function markUnknown(row, quizColumn) {
    const key = makeWordKey(row);

    if (!progressCache[key]) {
      progressCache[key] = {};
    }

    // Nếu đã từng đúng thì vẫn giữ true.
    if (progressCache[key][quizColumn] !== true) {
      progressCache[key][quizColumn] = false;
    }

    saveProgressCache();

    await syncWordToCloud(row);
  }

  /* -----------------------------
     FIREBASE AUTH
  ----------------------------- */

  async function loginWithGoogle() {
    try {
      setSyncStatus("Đang đăng nhập...");
      await auth.signInWithPopup(googleProvider);
    } catch (error) {
      console.error("Google login error:", error);

      if (error.code === "auth/unauthorized-domain") {
        alert(
          "Tên miền hiện tại chưa được cho phép trong Firebase Authentication. " +
          "Vào Authentication → Settings → Authorized domains và thêm nhatnl.io.vn."
        );
      } else if (error.code !== "auth/popup-closed-by-user") {
        alert("Đăng nhập Google chưa thành công: " + (error.message || error.code));
      }

      setSyncStatus("");
    }
  }

  async function logoutGoogle() {
    try {
      await auth.signOut();
    } catch (error) {
      console.error(error);
    }
  }

  async function handleAuthStateChanged(user) {
    currentUser = user || null;

    // Cache local được tách riêng theo UID.
    // Đổi tài khoản => tự đổi vùng dữ liệu local.
    loadLocalCache();

    if (user) {
      els.loginBtn.classList.add("hidden");
      els.logoutBtn.classList.remove("hidden");
      els.userChip.classList.add("visible");

      els.userName.textContent =
        user.displayName || user.email || "Google user";

      if (user.photoURL) {
        els.userPhoto.src = user.photoURL;
        els.userPhoto.classList.remove("hidden");
      } else {
        els.userPhoto.classList.add("hidden");
      }

      els.authStatus.textContent =
        "Đã đăng nhập — tiến độ sẽ đồng bộ với Firestore.";

      await loadProgressFromCloud();
    } else {
      els.loginBtn.classList.remove("hidden");
      els.logoutBtn.classList.add("hidden");
      els.userChip.classList.remove("visible");

      els.authStatus.textContent =
        "Chưa đăng nhập — tiến độ đang lưu trên trình duyệt này.";

      setSyncStatus("");
      renderTable();
    }
  }

  /* -----------------------------
     FIRESTORE SYNC
  ----------------------------- */

  function setSyncStatus(message) {
    els.syncStatus.textContent = message || "";
  }

  function makeCloudDocId(wordKey) {
    const bytes = new TextEncoder().encode(wordKey);
    let binary = "";

    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  async function syncWordToCloud(row) {
    if (!currentUser || !row || isLoadingCloud) {
      return;
    }

    const wordKey = makeWordKey(row);

    try {
      setSyncStatus("Đang đồng bộ...");

      await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("vocabulary")
        .doc(makeCloudDocId(wordKey))
        .set({
          wordKey,
          word: row["Từ"] ?? "",
          pronunciation: row["Phiên âm"] ?? "",
          partOfSpeech: row["Loại từ"] ?? "",
          meaning: row["Nghĩa"] ?? "",
          manualKnown: manualKnownCache[wordKey] === true,
          progress: progressCache[wordKey] || {},
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

      setSyncStatus("☁️ Đã đồng bộ");
    } catch (error) {
      console.error("Firestore sync error:", error);
      setSyncStatus("⚠️ Chưa đồng bộ được");
    }
  }

  async function loadProgressFromCloud() {
    if (!currentUser) {
      return;
    }

    isLoadingCloud = true;
    setSyncStatus("Đang tải tiến độ...");

    try {
      const snapshot = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("vocabulary")
        .get();

      if (snapshot.empty) {
        // Tài khoản chưa có cloud data:
        // giữ cache local riêng của UID này và đẩy lên cloud.
        isLoadingCloud = false;
        await uploadAllLocalProgress();
        setSyncStatus("☁️ Đã đồng bộ");
        renderTable();
        return;
      }

      // Cloud là nguồn chính cho tài khoản đã có dữ liệu.
      const cloudProgress = {};
      const cloudManual = {};

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const wordKey = data.wordKey;

        if (!wordKey) {
          return;
        }

        cloudProgress[wordKey] = data.progress || {};

        if (data.manualKnown === true) {
          cloudManual[wordKey] = true;
        }
      });

      progressCache = cloudProgress;
      manualKnownCache = cloudManual;

      saveProgressCache();
      saveManualCache();

      setSyncStatus("☁️ Đã tải tiến độ");
    } catch (error) {
      console.error("Firestore load error:", error);
      setSyncStatus("⚠️ Không tải được tiến độ");
    } finally {
      isLoadingCloud = false;
    }

    renderTable();
  }

  async function uploadAllLocalProgress() {
    if (!currentUser) {
      return;
    }

    const keys = new Set([
      ...Object.keys(progressCache),
      ...Object.keys(manualKnownCache)
    ]);

    for (const wordKey of keys) {
      const row = rowMap.get(wordKey);

      if (row) {
        await syncWordToCloud(row);
      }
    }
  }

  /* -----------------------------
     EXCEL
  ----------------------------- */

  function handleFile(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
          defval: ""
        });

        if (!rows.length) {
          alert("File Excel không có dữ liệu.");
          return;
        }

        const required = ["Từ", "Phiên âm", "Loại từ", "Nghĩa"];
        const missing = required.filter(column => !(column in rows[0]));

        if (missing.length) {
          alert(
            "File Excel phải có đủ 4 cột: " +
            "Từ, Phiên âm, Loại từ, Nghĩa"
          );
          return;
        }

        originalData = rows.map((row, index) => ({
          id: index + 1,
          "Từ": row["Từ"],
          "Phiên âm": row["Phiên âm"],
          "Loại từ": row["Loại từ"],
          "Nghĩa": row["Nghĩa"]
        }));

        currentData = originalData.map(row => ({ ...row }));
        rebuildRowMap();

        renderTable();

        if (currentUser) {
          uploadAllLocalProgress();
        }
      } catch (error) {
        console.error(error);
        alert("Không đọc được file Excel.");
      }
    };

    reader.readAsArrayBuffer(file);
  }

  /* -----------------------------
     TABLE / FILTER
  ----------------------------- */

  function getVisibleColumns() {
    return columns.filter(column => els[column.checkbox].checked);
  }

  function getQuizColumn() {
    return els.quizColumn.value;
  }

  function getFilteredData() {
    const filter = els.progressFilter.value;

    if (filter === "all") {
      return currentData;
    }

    return currentData.filter(row => {
      const known = isKnownInCurrentMode(row);

      return filter === "known" ? known : !known;
    });
  }

  function createStatusBadge(known) {
    const span = document.createElement("span");
    span.className = `badge ${known ? "badge-known" : "badge-unknown"}`;
    span.textContent = known ? "Đã thuộc" : "Chưa thuộc";
    return span;
  }

  function updateRowStatus(tr, row, visibleCount) {
    const known = isKnownInCurrentMode(row);
    const statusCell = tr.children[visibleCount];

    if (statusCell) {
      statusCell.replaceChildren(createStatusBadge(known));
    }

    const checkboxCell = tr.children[visibleCount + 1];
    const checkbox = checkboxCell?.querySelector('input[type="checkbox"]');

    if (checkbox) {
      // Checkbox luôn phản ánh đúng trạng thái hiện tại,
      // kể cả trạng thái sinh ra từ việc trả lời đúng.
      checkbox.checked = known;
    }
  }

  function renderTable() {
    const thead = els.vocabTable.tHead;
    const tbody = els.vocabTable.tBodies[0];

    thead.replaceChildren();
    tbody.replaceChildren();

    els.scoreBox.style.display = "none";

    const visibleColumns = getVisibleColumns();
    const quiz = getQuizColumn();
    const filteredData = getFilteredData();

    if (!visibleColumns.length) {
      const headerRow = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = "Thông báo";
      headerRow.appendChild(th);
      thead.appendChild(headerRow);

      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.textContent = "Bạn đang ẩn toàn bộ các cột.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const headerRow = document.createElement("tr");

    for (const column of visibleColumns) {
      const th = document.createElement("th");
      th.textContent =
        column.key === quiz ? `${column.key} ✍️` : column.key;
      headerRow.appendChild(th);
    }

    const statusTh = document.createElement("th");
    statusTh.textContent = "Trạng thái";
    headerRow.appendChild(statusTh);

    const learnedTh = document.createElement("th");
    learnedTh.textContent = "Đã thuộc";
    headerRow.appendChild(learnedTh);

    thead.appendChild(headerRow);

    if (!currentData.length) {
      appendMessageRow(
        tbody,
        visibleColumns.length + 2,
        "Hãy chọn file Excel để bắt đầu."
      );

      updateStatus(0);
      return;
    }

    if (!filteredData.length) {
      appendMessageRow(
        tbody,
        visibleColumns.length + 2,
        "Không có từ nào phù hợp với bộ lọc hiện tại."
      );

      updateStatus(0);
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const row of filteredData) {
      const tr = document.createElement("tr");
      const wordKey = makeWordKey(row);

      tr.dataset.wordKey = wordKey;

      for (const column of visibleColumns) {
        const td = document.createElement("td");

        if (column.key === quiz) {
          const input = document.createElement("input");
          input.type = "text";
          input.placeholder = `Nhập ${column.key.toLowerCase()}...`;
          input.dataset.column = column.key;
          input.dataset.wordKey = wordKey;

          const answer = document.createElement("div");
          answer.className = "answer hidden";
          answer.dataset.answerFor = column.key;

          td.append(input, answer);
        } else {
          td.textContent = row[column.key] ?? "";
        }

        tr.appendChild(td);
      }

      const known = isKnownInCurrentMode(row);

      const statusTd = document.createElement("td");
      statusTd.appendChild(createStatusBadge(known));
      tr.appendChild(statusTd);

      const learnedTd = document.createElement("td");
      const label = document.createElement("label");
      label.className = "learned-label";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";

      // SỬA LỖI:
      // trước đây checkbox chỉ phản ánh manualKnown.
      // Giờ nó phản ánh trạng thái thật trong chế độ hiện tại.
      checkbox.checked = known;
      checkbox.title = "Đánh dấu / bỏ đánh dấu trạng thái đã thuộc";

      checkbox.addEventListener("change", async () => {
        const desiredState = checkbox.checked;

        await setKnownFromCheckbox(row, desiredState);

        // Giữ nguyên màn hình, không render lại toàn bộ bảng.
        updateRowStatus(tr, row, visibleColumns.length);
      });

      label.appendChild(checkbox);
      learnedTd.appendChild(label);
      tr.appendChild(learnedTd);

      fragment.appendChild(tr);
    }

    tbody.appendChild(fragment);
    updateStatus(filteredData.length);
  }

  function appendMessageRow(tbody, colspan, message) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = colspan;
    td.textContent = message;

    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function updateStatus(count) {
    if (!currentData.length) {
      els.status.textContent = "Chưa có dữ liệu.";
      return;
    }

    const quiz = getQuizColumn();
    const filter = els.progressFilter.value;

    const filterLabel = {
      all: "Toàn bộ",
      known: "Đã thuộc",
      unknown: "Chưa thuộc"
    }[filter];

    els.status.textContent =
      `Tổng ${currentData.length} từ` +
      ` • Đang hiển thị ${count} từ` +
      ` • Bộ lọc: ${filterLabel}` +
      (quiz ? ` • Kiểm tra: ${quiz}` : "");
  }

  /* -----------------------------
     ACTIONS
  ----------------------------- */

  function shuffleWords() {
    if (!currentData.length) {
      alert("Bạn chưa import file Excel.");
      return;
    }

    currentData = [...currentData];

    for (let i = currentData.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentData[i], currentData[j]] =
        [currentData[j], currentData[i]];
    }

    renderTable();
  }

  function restoreOriginal() {
    if (!originalData.length) {
      alert("Bạn chưa import file Excel.");
      return;
    }

    currentData = originalData.map(row => ({ ...row }));
    renderTable();
  }

  async function grade() {
    if (!currentData.length) {
      alert("Bạn chưa import file Excel.");
      return;
    }

    const quiz = getQuizColumn();

    if (!quiz) {
      alert("Hãy chọn nội dung muốn kiểm tra.");
      return;
    }

    const visibleColumns = getVisibleColumns();
    const visibleKeys = visibleColumns.map(column => column.key);

    if (!visibleKeys.includes(quiz)) {
      alert(
        `Cột "${quiz}" đang bị ẩn. ` +
        "Hãy bật hiển thị cột này để làm bài."
      );
      return;
    }

    const filteredData = getFilteredData();
    const filteredMap = new Map(
      filteredData.map(row => [makeWordKey(row), row])
    );

    let total = 0;
    let correct = 0;
    const syncTasks = [];

    const rows = els.vocabTable.tBodies[0].querySelectorAll("tr[data-word-key]");

    for (const tr of rows) {
      const wordKey = tr.dataset.wordKey;
      const row = filteredMap.get(wordKey);

      if (!row) {
        continue;
      }

      const input = tr.querySelector(`input[data-column="${quiz}"]`);

      if (!input) {
        continue;
      }

      total++;

      const userAnswer = normalizeText(input.value);
      const correctAnswer = normalizeText(row[quiz]);
      const answer = tr.querySelector(`[data-answer-for="${quiz}"]`);

      if (userAnswer === correctAnswer) {
        correct++;

        input.style.borderColor = "#16a34a";
        answer.classList.add("hidden");

        tr.classList.remove("wrong");
        tr.classList.add("correct");

        const task = markKnown(row, quiz);
        syncTasks.push(task);
      } else {
        input.style.borderColor = "#dc2626";

        answer.textContent = `Đáp án: ${row[quiz]}`;
        answer.classList.remove("hidden");

        tr.classList.remove("correct");
        tr.classList.add("wrong");

        const task = markUnknown(row, quiz);
        syncTasks.push(task);
      }

      // Cập nhật ngay cả Trạng thái và checkbox.
      // Không render lại bảng => giữ nguyên màn hình kết quả.
      updateRowStatus(tr, row, visibleColumns.length);
    }

    // Không chặn UI quá lâu khi có nhiều từ.
    Promise.allSettled(syncTasks).catch(() => {});

    const percentage = total
      ? (correct / total * 100).toFixed(1)
      : "0.0";

    els.scoreBox.innerHTML =
      `🎯 Kết quả kiểm tra <b>${escapeHtml(quiz)}</b>: ` +
      `<b>${correct}/${total}</b> câu đúng — ` +
      `<b>${percentage}%</b>`;

    els.scoreBox.style.display = "block";
  }

  async function resetProgress() {
    const cloudText = currentUser ? " và trên Firestore" : "";

    const confirmed = confirm(
      `Bạn có chắc muốn xóa toàn bộ tiến độ học ` +
      `đã lưu trên trình duyệt này${cloudText} không?`
    );

    if (!confirmed) {
      return;
    }

    progressCache = {};
    manualKnownCache = {};

    saveProgressCache();
    saveManualCache();

    if (currentUser) {
      try {
        setSyncStatus("Đang xóa tiến độ trên cloud...");

        const snapshot = await db
          .collection("users")
          .doc(currentUser.uid)
          .collection("vocabulary")
          .get();

        let batch = db.batch();
        let count = 0;

        for (const docSnap of snapshot.docs) {
          batch.delete(docSnap.ref);
          count++;

          if (count === 450) {
            await batch.commit();
            batch = db.batch();
            count = 0;
          }
        }

        if (count > 0) {
          await batch.commit();
        }

        setSyncStatus("☁️ Đã xóa tiến độ cloud");
      } catch (error) {
        console.error(error);
        setSyncStatus("⚠️ Xóa cloud chưa thành công");
      }
    }

    renderTable();
    alert("Đã xóa toàn bộ tiến độ học.");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
