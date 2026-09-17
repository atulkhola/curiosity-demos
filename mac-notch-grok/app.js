(function () {
      const STATES = [
        { id: "idle", label: "Idle", msg: "Waiting for a task…", tasks: [0] },
        { id: "working", label: "Working", msg: "Prepping workspace & pulling context…", tasks: [0, 1] },
        { id: "uploading", label: "Uploading", msg: "Sending mockup to the thread…", tasks: [0, 1, 2] },
        { id: "error", label: "Error", msg: "Upload failed — retry or ping Tom.", tasks: [0, 1] },
        { id: "done", label: "Task finished", msg: "Drag and drop into windows.", tasks: [0, 1, 2] },
      ];

      const mac = document.getElementById("mac");
      const chips = document.querySelectorAll(".chip[data-state]");
      const statusLabel = document.getElementById("statusLabel");
      const statusMsg = document.getElementById("statusMsg");
      const miniTasks = document.getElementById("miniTasks");
      const island = document.getElementById("island");
      const windowBtn = document.getElementById("windowBtn");
      const autoCycle = document.getElementById("autoCycle");
      const clock = document.getElementById("clock");

      let stateIndex = 0;
      let cycleTimer = null;
      let userPaused = false;

      function setState(id) {
        const s = STATES.find((x) => x.id === id) || STATES[0];
        stateIndex = STATES.indexOf(s);
        mac.dataset.state = s.id;
        statusLabel.textContent = s.label;
        statusMsg.textContent = s.msg;
        chips.forEach((c) => c.classList.toggle("active", c.dataset.state === s.id));
        const spans = miniTasks.querySelectorAll("span");
        spans.forEach((el, i) => el.classList.toggle("on", s.tasks.includes(i)));
      }

      function nextState() {
        stateIndex = (stateIndex + 1) % STATES.length;
        setState(STATES[stateIndex].id);
        if (STATES[stateIndex].id === "done") {
          mac.classList.add("window-open");
          windowBtn.classList.add("active");
          windowBtn.setAttribute("aria-pressed", "true");
        }
      }

      function startCycle() {
        stopCycle();
        if (!autoCycle.checked || userPaused) return;
        cycleTimer = setInterval(nextState, 2800);
      }

      function stopCycle() {
        if (cycleTimer) clearInterval(cycleTimer);
        cycleTimer = null;
      }

      chips.forEach((btn) => {
        btn.addEventListener("click", () => {
          userPaused = true;
          stopCycle();
          setState(btn.dataset.state);
          setTimeout(() => {
            userPaused = false;
            startCycle();
          }, 6000);
        });
      });

      autoCycle.addEventListener("change", () => {
        if (autoCycle.checked) startCycle();
        else stopCycle();
      });

      function toggleExpand() {
        mac.classList.toggle("expanded");
      }
      island.addEventListener("click", (e) => {
        if (e.target.closest(".side-chips")) return;
        toggleExpand();
      });
      island.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleExpand();
        }
      });

      windowBtn.addEventListener("click", () => {
        const open = mac.classList.toggle("window-open");
        windowBtn.classList.toggle("active", open);
        windowBtn.setAttribute("aria-pressed", String(open));
        if (open) {
          mac.classList.add("expanded");
          setState("done");
        }
      });

      const cards = document.querySelectorAll(".card");
      cards.forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          card.classList.add("dragging");
          mac.classList.add("drag-over");
          e.dataTransfer.setData("text/plain", card.textContent.trim());
          e.dataTransfer.effectAllowed = "copy";
        });
        card.addEventListener("dragend", () => {
          card.classList.remove("dragging");
          mac.classList.remove("drag-over");
        });
      });

      island.addEventListener("dragover", (e) => {
        e.preventDefault();
        mac.classList.add("drag-over");
      });
      island.addEventListener("dragleave", () => mac.classList.remove("drag-over"));
      island.addEventListener("drop", (e) => {
        e.preventDefault();
        mac.classList.remove("drag-over");
        setState("done");
        statusMsg.textContent = "Dropped · \"" + (e.dataTransfer.getData("text/plain") || "card") + "\" into notch.";
        userPaused = true;
        stopCycle();
        setTimeout(() => { userPaused = false; startCycle(); }, 5000);
      });

      function tickClock() {
        const d = new Date();
        clock.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
      tickClock();
      setInterval(tickClock, 30000);

      setState("idle");
      startCycle();
    })();
