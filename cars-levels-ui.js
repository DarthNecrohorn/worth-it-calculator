/*
 * WORTH IT - Cars progressive reveal levels
 * Loaded after cars-ui.js. Existing Cars data and quality logic stay intact.
 */
(() => {
  "use strict";

  if (window.__worthItCarsProgressiveLevelsInstalled) return;
  window.__worthItCarsProgressiveLevelsInstalled = true;

  const CHUNK = 200;
  const levels = new Map();

  const getLevel = kind => {
    const value = levels.get(kind);
    return Number.isFinite(value) || value === Infinity ? value : 0;
  };

  const setLevel = (kind, value) => {
    const normalized =
      value === Infinity
        ? Infinity
        : Math.max(0, Math.floor(Number(value) || 0));

    levels.set(kind, normalized);
    currentVehicleShowAll = normalized > 0;
    return normalized;
  };

  const visibleCount = (kind, total) => {
    const count = Math.max(0, Number(total) || 0);
    const level = getLevel(kind);

    if (level === Infinity) return count;

    if (level <= 0) {
      return Math.min(
        count,
        Math.max(
          1,
          getVehiclesPerRow() *
          getPopularInitialVisibleRows(kind)
        )
      );
    }

    return Math.min(count, level * CHUNK);
  };

  const getState = kind =>
    getStablePopularDisplayState(kind);

  function applyVisibility(kind) {
    const grid =
      document.getElementById("popularCarsGrid");

    if (!grid) return;

    const state = getState(kind);
    const level =
      state?.revealLevel ??
      getLevel(kind);

    const cards = Array.from(
      grid.querySelectorAll(
        '.car-card[data-popular-stable-card="true"]'
      )
    );

    const limit =
      visibleCount(
        kind,
        cards.length
      );

    cards.forEach((card, index) => {
      const show =
        level === Infinity ||
        index < limit;

      card.style.display =
        show ? "" : "none";

      card.dataset.popularDeferred =
        show ? "false" : "true";
    });
  }

  const originalStart =
    startStablePopularVehicleDisplay;

  startStablePopularVehicleDisplay =
    function(kind, showAll = false) {
      const state =
        originalStart(
          kind,
          showAll
        );

      if (state) {
        const level =
          getLevel(kind);

        state.revealLevel =
          showAll ? Infinity : level;

        state.previousRevealLevel =
          Number.isFinite(level)
            ? level
            : 0;
      }

      return state;
    };

  const originalHide =
    hideOrShowStablePopularCards;

  hideOrShowStablePopularCards =
    function(kind, showAll = false) {
      originalHide(
        kind,
        showAll
      );

      applyVisibility(
        kind
      );
    };

  const originalAppend =
    appendStablePopularVehicleCards;

  appendStablePopularVehicleCards =
    function(kind, vehicles, showAll = false) {
      originalAppend(
        kind,
        vehicles,
        showAll
      );

      applyVisibility(
        kind
      );
    };

  async function reveal(
    kind,
    targetLevel
  ) {
    if (
      currentVehicleKind !== kind ||
      currentVehicleMode !== "popular"
    ) return;

    const state =
      getState(kind);

    const quality =
      popularVehicleQualityState.get(
        kind
      );

    if (!state || !quality) return;

    if (targetLevel === Infinity) {
      state.previousRevealLevel =
        Number.isFinite(
          getLevel(kind)
        )
          ? getLevel(kind)
          : 0;

      setLevel(
        kind,
        Infinity
      );

      state.revealLevel =
        Infinity;

      state.showAll =
        true;

      appendStablePopularVehicleCards(
        kind,
        quality.validVehicles,
        true
      );

      currentVehicleResults =
        quality.validVehicles.slice();

      renderVehicleCollapseButton(
        kind
      );

      updateVehicleFloatingCollapseButton();

      if (
        quality.validVehicles.length <
          MAX_UNIFIED_VEHICLES &&
        !quality.exhausted
      ) {
        void ensurePopularVehicleQuality(
          kind,
          quality.candidates,
          MAX_UNIFIED_VEHICLES,
          Math.max(
            getPopularMaxNewChecks(kind),
            MAX_UNIFIED_VEHICLES
          )
        ).then(
          () => {
            if (
              currentVehicleKind !== kind ||
              currentVehicleMode !== "popular"
            ) return;

            const latest =
              popularVehicleQualityState.get(
                kind
              );

            const vehicles =
              Array.isArray(
                latest?.validVehicles
              )
                ? latest.validVehicles
                : [];

            currentVehicleResults =
              vehicles.slice();

            appendStablePopularVehicleCards(
              kind,
              vehicles,
              true
            );

            renderVehicleCollapseButton(
              kind
            );

            updateVehicleFloatingCollapseButton();
          }
        ).catch(
          () => {}
        );
      }

      return;
    }

    const targetCount =
      Math.max(
        1,
        targetLevel * CHUNK
      );

    if (
      quality.validVehicles.length <
        targetCount &&
      !quality.exhausted
    ) {
      const wrapper =
        document.getElementById(
          "carsVehicleExpandButton"
        );

      const primary =
        wrapper?.querySelector(
          ".cars-expand-button"
        );

      if (primary) {
        primary.disabled =
          true;

        primary.textContent =
          "Loading next 200 vehicles…";
      }

      await ensurePopularVehicleQuality(
        kind,
        quality.candidates,
        targetCount,
        Math.max(
          getPopularMaxNewChecks(kind),
          targetCount
        )
      );
    }

    if (
      currentVehicleKind !== kind ||
      currentVehicleMode !== "popular"
    ) return;

    const latest =
      popularVehicleQualityState.get(
        kind
      ) || quality;

    setLevel(
      kind,
      targetLevel
    );

    state.revealLevel =
      targetLevel;

    state.showAll =
      true;

    currentVehicleResults =
      latest.validVehicles.slice();

    appendStablePopularVehicleCards(
      kind,
      currentVehicleResults,
      true
    );

    renderVehicleExpandButton(
      currentVehicleResults,
      currentVehicleResults.slice(
        0,
        visibleCount(
          kind,
          currentVehicleResults.length
        )
      ),
      kind,
      stablePopularHasMoreVehicles(
        kind,
        visibleCount(
          kind,
          currentVehicleResults.length
        )
      )
    );

    updateVehicleFloatingCollapseButton();
  }

  function collapse(
    kind,
    scrollToTop = false
  ) {
    const state =
      getState(kind);

    const quality =
      popularVehicleQualityState.get(
        kind
      );

    if (!state || !quality) {
      setLevel(
        kind,
        0
      );

      renderVehicleCards(
        currentVehicleResults,
        kind,
        false
      );

      return;
    }

    const current =
      getLevel(kind);

    const next =
      current === Infinity
        ? Math.max(
            0,
            Number(
              state.previousRevealLevel
            ) || 0
          )
        : Math.max(
            0,
            current - 1
          );

    setLevel(
      kind,
      next
    );

    state.revealLevel =
      next;

    state.showAll =
      next > 0;

    currentVehicleResults =
      quality.validVehicles.slice();

    applyVisibility(
      kind
    );

    renderVehicleExpandButton(
      currentVehicleResults,
      currentVehicleResults.slice(
        0,
        visibleCount(
          kind,
          currentVehicleResults.length
        )
      ),
      kind,
      stablePopularHasMoreVehicles(
        kind,
        visibleCount(
          kind,
          currentVehicleResults.length
        )
      )
    );

    if (next <= 0) {
      state.previousRevealLevel =
        0;

      hideVehicleFloatingCollapseButton();
    } else {
      updateVehicleFloatingCollapseButton();
    }

    if (
      scrollToTop &&
      next === 0
    ) {
      const section =
        document.getElementById(
          "carsSection"
        );

      if (section) {
        const rect =
          section.getBoundingClientRect();

        window.scrollTo({
          top:
            Math.max(
              0,
              window.scrollY +
              rect.top -
              18
            ),
          behavior:
            "smooth"
        });
      }
    }
  }

  function renderControls(
    totalVehicles,
    visibleVehicles,
    kind,
    hasMore = false
  ) {
    const old =
      document.getElementById(
        "carsVehicleExpandButton"
      );

    if (old) old.remove();

    if (
      !Array.isArray(totalVehicles) ||
      !totalVehicles.length
    ) return;

    const level =
      getLevel(kind);

    const shown =
      visibleCount(
        kind,
        totalVehicles.length
      );

    const remaining =
      Math.max(
        0,
        totalVehicles.length -
        shown
      );

    const canExpand =
      remaining > 0 ||
      Boolean(hasMore);

    if (
      level <= 0 &&
      !canExpand
    ) return;

    const info =
      getVehicleKindInfo(
        kind
      );

    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.id =
      "carsVehicleExpandButton";

    wrapper.className =
      "cars-expand-wrapper";

    wrapper.style.gap =
      "10px";

    wrapper.style.flexWrap =
      "wrap";

    const addButton =
      (label, handler, extraClass = "") => {
        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          (
            "cars-expand-button " +
            extraClass
          ).trim();

        button.textContent =
          label;

        button.addEventListener(
          "click",
          handler
        );

        wrapper.appendChild(
          button
        );

        return button;
      };

    const finalStep =
      !hasMore &&
      remaining > 0 &&
      remaining <= CHUNK;

    if (level === Infinity) {
      addButton(
        "Show less " +
          info.plural.toLowerCase() +
          " ↑",
        () =>
          collapse(
            kind
          )
      );
    } else {
      if (canExpand) {
        addButton(
          finalStep
            ? "Show all " +
              info.plural.toLowerCase() +
              " ↓"
            : "Show next " +
              CHUNK +
              " " +
              info.plural.toLowerCase() +
              " ↓",
          async event => {
            const button =
              event.currentTarget;

            button.disabled =
              true;

            const target =
              finalStep
                ? Infinity
                : Math.max(
                    1,
                    level + 1
                  );

            button.textContent =
              finalStep
                ? "Loading remaining vehicles…"
                : "Loading next 200 vehicles…";

            try {
              await reveal(
                kind,
                target
              );
            } catch (error) {
              console.error(
                "Cars progressive reveal failed:",
                error
              );

              button.disabled =
                false;

              button.textContent =
                finalStep
                  ? "Show all " +
                    info.plural.toLowerCase() +
                    " ↓"
                  : "Show next " +
                    CHUNK +
                    " " +
                    info.plural.toLowerCase() +
                    " ↓";
            }
          }
        );
      }

      if (level > 0) {
        addButton(
          "Show less " +
            info.plural.toLowerCase() +
            " ↑",
          () =>
            collapse(
              kind
            ),
          "cars-expand-less-button"
        );
      }
    }

    const grid =
      document.getElementById(
        "popularCarsGrid"
      );

    if (
      grid &&
      grid.parentNode
    ) {
      grid.parentNode.insertBefore(
        wrapper,
        grid.nextSibling
      );
    }
  }

  renderVehicleExpandButton =
    renderControls;

  renderVehicleCollapseButton =
    function(kind) {
      renderControls(
        currentVehicleResults,
        currentVehicleResults.slice(
          0,
          visibleCount(
            kind,
            currentVehicleResults.length
          )
        ),
        kind,
        stablePopularHasMoreVehicles(
          kind,
          visibleCount(
            kind,
            currentVehicleResults.length
          )
        )
      );
    };

  /*
   * Replace the old floating Show less DOM listener with a clean clone.
   */
  const originalEnsureFloating =
    ensureVehicleFloatingCollapseButton;

  ensureVehicleFloatingCollapseButton =
    function() {
      const button =
        originalEnsureFloating();

      if (
        !button ||
        button.dataset.worthItLevelCollapse ===
          "true"
      ) {
        return button;
      }

      const replacement =
        button.cloneNode(
          true
        );

      replacement.dataset.worthItLevelCollapse =
        "true";

      button.replaceWith(
        replacement
      );

      replacement.addEventListener(
        "click",
        event => {
          event.preventDefault();
          event.stopImmediatePropagation();

          collapse(
            currentVehicleKind,
            true
          );
        }
      );

      return replacement;
    };

  /*
   * Normal compact popular renders start from level zero.
   */
  const originalRenderCards =
    renderVehicleCards;

  renderVehicleCards =
    function(
      vehicles,
      kind = currentVehicleKind,
      forceShowAll = false
    ) {
      if (
        currentVehicleMode === "popular" &&
        !forceShowAll
      ) {
        setLevel(
          kind,
          0
        );
      }

      return originalRenderCards(
        vehicles,
        kind,
        forceShowAll
      );
    };
})();
