(function () {
  "use strict";

  const { KIT_ORDER, KIT_META, FIXED_REQUIRED_EXP, describeState, transition, normalizeState, convertState } =
    window.CollectionSolver;

  const levelGrid = document.getElementById("levelGrid");
  const currentExp = document.getElementById("currentExp");
  const requiredExpLabel = document.getElementById("requiredExpLabel");
  const blueStock = document.getElementById("blueStock");
  const purpleStock = document.getElementById("purpleStock");
  const yellowStock = document.getElementById("yellowStock");
  const calculateButton = document.getElementById("calculateButton");
  const resetButton = document.getElementById("resetButton");
  const resultBox = document.getElementById("resultBox");
  const detailBox = document.getElementById("detailBox");
  const runState = document.getElementById("runState");
  const candidateCount = document.getElementById("candidateCount");
  const progressFill = document.getElementById("progressFill");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");

  let selectedGrade = "R";
  let selectedLevel = 1;
  let worker = null;
  let requestId = 0;
  let latestResult = null;
  let manualStockEditRequired = false;

  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return "-";
    return new Intl.NumberFormat("ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
  }

  function formatPercent(value, digits = 2) {
    return `${formatNumber(value * 100, digits)}%`;
  }

  function formatUses(kitCount) {
    return `${formatNumber(kitCount / 10, 2)}회`;
  }

  function kitName(kit) {
    if (kit === "convert") return "SR 등급으로 교체";
    return KIT_META[kit].label;
  }

  function kitText(kit, count = 1) {
    if (kit === "convert") return "SR 등급으로 교체";
    return `${kitName(kit)} ${count}회`;
  }

  function kitClass(kit) {
    return kit;
  }

  function kitChip(kit, text = kitText(kit)) {
    if (kit === "convert") return `<span class="action-chip"><i></i>${text}</span>`;
    return `<span class="action-chip ${kitClass(kit)}"><i></i>${text}</span>`;
  }

  function levelButtonText(level) {
    if (level <= 5) return `☆ ⸰ ⸰ ${level}`;
    if (level <= 10) return `☆☆ ⸰ ${level}`;
    return `☆☆☆ ${level}`;
  }

  function levelRow(label, levels) {
    const row = document.createElement("div");
    row.className = "level-row";
    const rowLabel = document.createElement("span");
    rowLabel.textContent = label;
    row.append(rowLabel);
    levels.forEach((level) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-button";
      button.dataset.level = String(level);
      button.textContent = levelButtonText(level);
      button.setAttribute("aria-label", `${level}단계`);
      row.append(button);
    });
    return row;
  }

  function renderLevels() {
    levelGrid.textContent = "";
    levelGrid.append(
      levelRow("1~5", [1, 2, 3, 4, 5]),
      levelRow("6~10", [6, 7, 8, 9, 10]),
      levelRow("11~15", [11, 12, 13, 14, 15]),
    );
    updateLevelButtons();
  }

  function updateLevelButtons() {
    levelGrid.querySelectorAll(".level-button").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.level) === selectedLevel);
    });
  }

  function requiredForGrade(grade = selectedGrade) {
    return FIXED_REQUIRED_EXP[grade];
  }

  function sanitizeExp() {
    const required = requiredForGrade();
    if (selectedLevel >= 15) {
      currentExp.value = "0";
      currentExp.max = "0";
      currentExp.disabled = true;
      return 0;
    }
    currentExp.disabled = false;
    const value = Math.floor((Number(currentExp.value) || 0) / 100) * 100;
    const safeValue = Math.min(Math.max(0, value), required - 100);
    currentExp.value = String(safeValue);
    currentExp.max = String(required - 100);
    currentExp.step = "100";
    return safeValue;
  }

  function setGrade(grade) {
    selectedGrade = grade;
    document.body.classList.toggle("grade-r", grade === "R");
    document.body.classList.toggle("grade-sr", grade === "SR");
    document.querySelectorAll(".seg-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.grade === grade);
    });
    const required = requiredForGrade(grade);
    requiredExpLabel.textContent = formatInteger(required);
    currentExp.max = String(required - 100);
    sanitizeExp();
  }

  function setState(state) {
    const normalized = normalizeState(state);
    if (normalized.grade === "SR" && normalized.level >= 15) {
      setGrade("SR");
      selectedLevel = 15;
      currentExp.value = "0";
      updateLevelButtons();
      updateLevelMode();
      return;
    }
    setGrade(normalized.grade);
    selectedLevel = normalized.level;
    currentExp.value = String(normalized.exp);
    updateLevelButtons();
    updateLevelMode();
  }

  function renderMaxLevelState() {
    latestResult = null;
    resultBox.className = "";
    detailBox.className = "empty-result";
    if (selectedGrade === "R") {
      resultBox.innerHTML = `
        <div class="result-content">
          <div class="recommendation">
            <div class="next-action">
              <div>
                <span class="action-label">추천 행동</span>
                <strong>${kitChip("convert", "SR 등급으로 교체")}</strong>
              </div>
            </div>
            <div class="outcome-panel">
              <h3>등급 교체</h3>
              <div class="outcome-buttons">
                <button class="convert-button" type="button" data-convert="sr">교체 적용</button>
              </div>
            </div>
          </div>
        </div>
      `;
      detailBox.textContent = "R 15레벨은 키트 계산 대상이 아닙니다. SR 5레벨로 교체한 뒤 다시 계산하세요.";
      return;
    }

    resultBox.innerHTML = `<div class="result-content"><div class="callout">SR 15레벨입니다. 추가 행동이 없습니다.</div></div>`;
    detailBox.textContent = "SR 15레벨은 최종 목표 상태입니다.";
  }

  function updateLevelMode() {
    const maxLevel = selectedLevel >= 15;
    sanitizeExp();
    calculateButton.disabled = maxLevel || manualStockEditRequired;
    if (maxLevel) {
      renderMaxLevelState();
      return;
    }
    if (manualStockEditRequired) return;
    if (!latestResult) {
      resultBox.className = "empty-result";
      resultBox.textContent = "입력값을 넣고 계산을 실행하세요.";
      detailBox.className = "empty-result";
      detailBox.textContent = "계산 후 선택 근거와 검산 결과가 표시됩니다.";
    }
  }

  function markInputChanged() {
    latestResult = null;
    updateLevelMode();
  }

  function clearManualStockLock() {
    manualStockEditRequired = false;
    updateLevelMode();
  }

  function getWorker() {
    if (typeof Worker === "undefined") return null;
    if (worker) return worker;
    try {
      worker = new Worker("collection-worker.js");
      return worker;
    } catch (error) {
      return null;
    }
  }

  function inputNumber(element, fallback = 0) {
    const value = Number(element.value);
    const integer = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
    element.value = String(integer);
    return integer;
  }

  function collectInput() {
    const exp = sanitizeExp();
    return {
      start: {
        grade: selectedGrade,
        level: selectedLevel,
        exp,
      },
      stock: {
        blue: inputNumber(blueStock, 0),
        purple: inputNumber(purpleStock, 0),
        yellow: inputNumber(yellowStock, 0),
      },
    };
  }

  function updateProgress(progress) {
    const scanned = progress.scanned || 0;
    if (progress.phase === "mdp") {
      progressFill.style.width = "56%";
      candidateCount.textContent = `${scanned.toLocaleString("ko-KR")} states`;
      if (loadingText) loadingText.textContent = `${scanned.toLocaleString("ko-KR")}개 상태를 평가했습니다.`;
      return;
    }
    const total = progress.total || 1;
    progressFill.style.width = `${Math.min(92, 8 + (scanned / total) * 84)}%`;
    candidateCount.textContent = `${scanned}/${total}`;
  }

  function solveInWorker(input) {
    const activeWorker = getWorker();
    if (!activeWorker) return null;
    requestId += 1;
    const id = requestId;

    return new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const data = event.data || {};
        if (data.id !== id) return;
        if (data.type === "progress") {
          updateProgress(data.progress || {});
          return;
        }
        activeWorker.removeEventListener("message", handleMessage);
        activeWorker.removeEventListener("error", handleError);
        if (data.type === "result") resolve(data.result);
        else reject(new Error(data.message || "Worker calculation failed."));
      };
      const handleError = (event) => {
        activeWorker.removeEventListener("message", handleMessage);
        activeWorker.removeEventListener("error", handleError);
        reject(new Error(event.message || "Worker calculation failed."));
      };

      activeWorker.addEventListener("message", handleMessage);
      activeWorker.addEventListener("error", handleError);
      activeWorker.postMessage({ type: "solve", id, input });
    });
  }

  function solveBestAvailable(input) {
    const workerPromise = solveInWorker(input);
    if (workerPromise) {
      return workerPromise.catch(() => {
        if (worker) {
          worker.terminate();
          worker = null;
        }
        return window.CollectionSolver.solve(input, updateProgress);
      });
    }
    return Promise.resolve(window.CollectionSolver.solve(input, updateProgress));
  }

  function setLoading(active) {
    if (!loadingOverlay) return;
    loadingOverlay.hidden = !active;
    if (active && loadingText) loadingText.textContent = "보유 키트 상태를 MDP로 평가하고 있습니다.";
  }

  function vectorCells(vector) {
    return KIT_ORDER.map((kit) => `<span>${KIT_META[kit].shortLabel} ${formatUses(vector[kit])}</span>`).join(" / ");
  }

  function routeRows(route) {
    return route
      .map(
        (step, index) => `
          <li>
            <b>${index + 1}</b>
            <span>
              ${step.state}: ${kitText(step.kit)} 사용.
              대성공 ${formatPercent(step.probability, 1)} → ${step.success},
              실패 → ${step.fail}
            </span>
          </li>
        `,
      )
      .join("");
  }

  function candidateRows(candidates) {
    return candidates
      .map(
        (candidate) => `
          <tr>
            <td>${candidate.name}</td>
            <td>${kitChip(candidate.firstAction)}</td>
            <td>${formatPercent(candidate.successProbability, 2)}</td>
            <td>${vectorCells(candidate.vector)}</td>
            <td>${formatNumber(candidate.pressure, 4)}</td>
          </tr>
        `,
      )
      .join("");
  }

  function renderResult(result) {
    latestResult = result;
    if (result.terminal) {
      resultBox.className = "";
      resultBox.innerHTML = `<div class="result-content"><div class="callout">${result.message}</div></div>`;
      detailBox.className = "empty-result";
      detailBox.textContent = "완료 상태입니다.";
      return;
    }

    if (!result.possible) {
      resultBox.className = "";
      resultBox.innerHTML = `<div class="result-content"><div class="error">${result.message}</div></div>`;
      detailBox.className = "empty-result";
      detailBox.textContent = "사용 가능한 키트가 부족합니다.";
      return;
    }

    const best = result.best;
    const input = result.input;
    const edge = transition(input.start, best.firstAction);
    const run = best.run || {
      count: 1,
      success: edge.success,
      fail: edge.fail,
      greatSuccessProbability: best.firstProbability,
      noGreatSuccessProbability: 1 - best.firstProbability,
    };
    const multiUseNote =
      run.count > 1
        ? `<p class="change-note">다회 사용 중 대성공이 발생하면 몇 번째 사용에서 발생했는지 알 수 없으므로, 레벨만 이동하고 보유 키트는 직접 수정해야 합니다.</p>`
        : "";

    resultBox.className = "";
    resultBox.innerHTML = `
      <div class="result-content">
        <div class="recommendation">
          <div class="next-action">
            <div>
              <span class="action-label">추천 행동</span>
              <strong>${kitChip(best.firstAction, kitText(best.firstAction, run.count))}</strong>
            </div>
          </div>
          <div class="outcome-panel">
            <h3>대성공 여부</h3>
            ${multiUseNote}
            <div class="outcome-buttons">
              <button class="success-button" type="button" data-outcome="success">예</button>
              <button class="fail-button" type="button" data-outcome="fail">아니오</button>
            </div>
          </div>
        </div>
      </div>
    `;

    detailBox.className = "";
    detailBox.innerHTML = `
      <div class="result-content">
        <div class="metric-grid">
          <div class="metric"><span>현재 상태</span><strong>${describeState(input.start)}</strong></div>
          <div class="metric"><span>추천 구간 대성공 확률</span><strong>${formatPercent(run.greatSuccessProbability, 1)}</strong></div>
          <div class="metric"><span>SR15 도달 확률</span><strong>${formatPercent(best.successProbability, 2)}</strong></div>
          <div class="metric"><span>정확 계산 상태 수</span><strong>${formatInteger(result.stats.states)}</strong></div>
        </div>

        <dl class="detail-list">
          <div>
            <dt>성공 시</dt>
            <dd>${describeState(run.success)}</dd>
          </div>
          <div>
            <dt>실패 시</dt>
            <dd>${describeState(run.fail)}</dd>
          </div>
          <div>
            <dt>예상 소모</dt>
            <dd>${vectorCells(best.vector)}</dd>
          </div>
          <div>
            <dt>계산 방식</dt>
            <dd>보유 키트 사용 가능 횟수를 상태에 포함한 유한 MDP입니다. 매 행동마다 키트가 1회 감소하므로 반복 수렴이 필요 없고, 허용오차는 0입니다.</dd>
          </div>
          <div>
            <dt>검산</dt>
            <dd>선택 정책의 정확 전이값과 ${result.monteCarlo.runs.toLocaleString("ko-KR")}회 몬테카를로 검산을 함께 표시합니다. 몬테카를로 SR15 도달률은 ${formatPercent(result.monteCarlo.successProbability, 2)}입니다.</dd>
          </div>
        </dl>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>후보</th>
                <th>첫 행동</th>
                <th>SR15 도달 확률</th>
                <th>예상 소모</th>
                <th>보유량 압박</th>
              </tr>
            </thead>
            <tbody>${candidateRows(result.topCandidates)}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderError(error) {
    latestResult = null;
    resultBox.className = "";
    resultBox.innerHTML = `<div class="result-content"><div class="error">${error.message || String(error)}</div></div>`;
    detailBox.className = "empty-result";
    detailBox.textContent = "오류가 발생했습니다.";
  }

  async function runCalculation() {
    const input = collectInput();
    setLoading(true);
    calculateButton.disabled = true;
    runState.textContent = "계산 중";
    candidateCount.textContent = "0";
    progressFill.style.width = "8%";
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const result = await solveBestAvailable(input);
      renderResult(result);
      runState.textContent = "완료";
      candidateCount.textContent = result.candidateCount ? result.candidateCount.toLocaleString("ko-KR") : "0";
      progressFill.style.width = "100%";
    } catch (error) {
      renderError(error);
      runState.textContent = "오류";
      progressFill.style.width = "0%";
    } finally {
      setLoading(false);
      calculateButton.disabled = selectedLevel >= 15;
    }
  }

  function stockInputForKit(kit) {
    if (kit === "blue") return blueStock;
    if (kit === "purple") return purpleStock;
    return yellowStock;
  }

  function applyOutcome(outcome) {
    if (!latestResult || !latestResult.possible) return;
    const best = latestResult.best;
    const edge = transition(latestResult.input.start, best.firstAction);
    const run = best.run || {
      count: 1,
      success: edge.success,
      fail: edge.fail,
    };
    const stockInput = stockInputForKit(best.firstAction);
    const beforeStock = inputNumber(stockInput, 0);
    const exactStockChange = outcome !== "success" || run.count === 1;
    const usedCount = exactStockChange ? run.count * 10 : 0;
    if (exactStockChange) stockInput.value = String(Math.max(0, beforeStock - usedCount));
    if (!exactStockChange) manualStockEditRequired = true;
    const nextState = outcome === "success" ? run.success : run.fail;
    setState(nextState);

    const outcomeLabel = outcome === "success" ? "대성공" : "대성공 아님";
    const convertBlock =
      nextState.grade === "R" && nextState.level >= 15
        ? `
          <div class="recommendation">
            <div class="next-action">
              <div>
                <span class="action-label">추천 행동</span>
                <strong>${kitChip("convert", "SR 등급으로 교체")}</strong>
              </div>
            </div>
            <div class="outcome-panel">
              <h3>등급 교체</h3>
              <div class="outcome-buttons">
                <button class="convert-button" type="button" data-convert="sr">교체 적용</button>
              </div>
            </div>
          </div>
        `
        : "";
    resultBox.className = "";
    resultBox.innerHTML = `
      <div class="result-content">
        <div class="callout">
          적용 완료: ${kitText(best.firstAction, run.count)} 사용, ${outcomeLabel} 결과로 ${describeState(nextState)}가 반영되었습니다.
          ${
            exactStockChange
              ? `${kitName(best.firstAction)} 보유량은 ${formatInteger(beforeStock)}개에서 ${formatInteger(Math.max(0, beforeStock - usedCount))}개가 되었습니다.`
              : "다회 사용 중 대성공 발생 시점이 불명확하므로 보유 키트 수를 직접 수정해야 합니다. 수정 전까지 계산은 잠깁니다."
          }
        </div>
        ${convertBlock}
      </div>
    `;
    detailBox.className = "empty-result";
    detailBox.textContent = exactStockChange ? "변경된 상태로 다시 계산하세요." : "보유 키트 수를 실제 결과에 맞게 수정하면 계산이 다시 활성화됩니다.";
    latestResult = null;
    updateLevelMode();
  }

  function applyConvert() {
    const nextState = convertState();
    setState(nextState);
    resultBox.className = "";
    resultBox.innerHTML = `
      <div class="result-content">
        <div class="callout">SR 등급으로 교체했습니다. 현재 상태는 ${describeState(nextState)}입니다.</div>
      </div>
    `;
    detailBox.className = "empty-result";
    detailBox.textContent = "변경된 상태로 다시 계산하세요.";
    latestResult = null;
  }

  function resetInputs() {
    manualStockEditRequired = false;
    selectedLevel = 1;
    setGrade("R");
    currentExp.value = "0";
    blueStock.value = "0";
    purpleStock.value = "0";
    yellowStock.value = "0";
    updateLevelButtons();
    updateLevelMode();
    latestResult = null;
    resultBox.className = "empty-result";
    resultBox.textContent = "입력값을 넣고 계산을 실행하세요.";
    detailBox.className = "empty-result";
    detailBox.textContent = "계산 후 선택 근거와 검산 결과가 표시됩니다.";
    runState.textContent = "대기";
    candidateCount.textContent = "0";
    progressFill.style.width = "0%";
  }

  function bindEvents() {
    document.querySelectorAll(".seg-button").forEach((button) => {
      button.addEventListener("click", () => {
        setGrade(button.dataset.grade);
        markInputChanged();
      });
    });

    levelGrid.addEventListener("click", (event) => {
      const button = event.target.closest(".level-button");
      if (!button) return;
      selectedLevel = Number(button.dataset.level);
      updateLevelButtons();
      markInputChanged();
    });

    resultBox.addEventListener("click", (event) => {
      const convertButton = event.target.closest("[data-convert]");
      if (convertButton) {
        applyConvert();
        return;
      }
      const button = event.target.closest("[data-outcome]");
      if (!button) return;
      applyOutcome(button.dataset.outcome);
    });

    currentExp.addEventListener("change", () => {
      sanitizeExp();
      markInputChanged();
    });
    [blueStock, purpleStock, yellowStock].forEach((input) =>
      input.addEventListener("change", () => {
        inputNumber(input, 0);
        clearManualStockLock();
        markInputChanged();
      }),
    );
    calculateButton.addEventListener("click", runCalculation);
    resetButton.addEventListener("click", resetInputs);
  }

  function boot() {
    renderLevels();
    bindEvents();
    setGrade("R");
    updateLevelMode();
  }

  boot();
})();
