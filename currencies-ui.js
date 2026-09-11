/* =========================================================
   CURRENCIES UI
========================================================= */

function renderCurrenciesUI() {
    const app = document.getElementById("currenciesApp");

    if (!app) return;

    app.innerHTML = `
        <div class="money-block">

            <div class="money-block-header">
                <div>
                    <h3>💱 Currencies</h3>
                    <p>Popular currencies & exchange rates</p>
                </div>
            </div>

            <div class="money-block">
                <div class="money-block-header">
                    <div>
                        <h3>Major currencies</h3>
                        <p>Important currencies from major economies</p>
                    </div>
                </div>

                <div class="money-grid" id="majorCurrenciesGrid"></div>
            </div>

            <div class="money-block">
                <div class="money-block-header">
                    <div>
                        <h3>All currencies</h3>
                        <p>Search and explore available currencies</p>
                    </div>
                </div>

                <div class="calculator-toolbar">
                    <div class="calculator-search">
                        <span class="calculator-search-icon">🔎</span>
                        <input
                            type="text"
                            id="currencySearch"
                            placeholder="Search currencies..."
                            autocomplete="off"
                        >
                    </div>
                </div>

                <div class="money-grid" id="allCurrenciesGrid"></div>
            </div>

            <div class="money-updated">
                Last updated:
                <span id="moneyLastUpdated">—</span>
            </div>

        </div>
    `;
}


/* =========================================================
   INIT
========================================================= */

function initCurrenciesUI() {
    renderCurrenciesUI();
}

window.renderCurrenciesUI = renderCurrenciesUI;
window.initCurrenciesUI = initCurrenciesUI;
