/* =========================================================
   CURRENCIES API
========================================================= */

export async function onRequest(context) {

    try {

        const url =
            new URL(context.request.url);

        const base =
            (url.searchParams.get("base") || "EUR")
                .toUpperCase();


        /* =====================================================
           TODAY
        ===================================================== */

        const now = new Date();

        const today =
            [
                now.getUTCFullYear(),
                String(now.getUTCMonth() + 1).padStart(2, "0"),
                String(now.getUTCDate()).padStart(2, "0")
            ].join("-");


        /* =====================================================
           CURRENCY LIST
        ===================================================== */

        const currenciesResponse =
            await fetch(
                "https://api.frankfurter.dev/v2/currencies"
            );

        if (!currenciesResponse.ok) {
            throw new Error(
                `Currencies error: ${currenciesResponse.status}`
            );
        }

        const currencies =
            await currenciesResponse.json();


        /* =====================================================
           CURRENT RATES
        ===================================================== */

        const ratesResponse =
            await fetch(
                `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}`
            );

        if (!ratesResponse.ok) {
            throw new Error(
                `Rates error: ${ratesResponse.status}`
            );
        }

        const rates =
            await ratesResponse.json();


        /* =====================================================
           MAJOR CURRENCIES
        ===================================================== */

        const majorQuotes = [
            "USD",
            "HKD",
            "SGD",
            "KRW",
            "ZAR",
            "NOK",
            "SEK",
            "CZK"
        ];


        /* =====================================================
           HISTORICAL DATA FOR MAJOR CURRENCIES
           
           We deliberately request a wider period because
           Frankfurter can return incomplete data for the
           latest calendar date.
        ===================================================== */

        const historicalFromDate = new Date(now);

        historicalFromDate.setUTCDate(
            historicalFromDate.getUTCDate() - 30
        );

        const fromDate =
            [
                historicalFromDate.getUTCFullYear(),
                String(
                    historicalFromDate.getUTCMonth() + 1
                ).padStart(2, "0"),
                String(
                    historicalFromDate.getUTCDate()
                ).padStart(2, "0")
            ].join("-");


        const historicalResponse =
            await fetch(
                `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&from=${fromDate}&to=${today}`
            );


        let historicalRates = [];


        if (historicalResponse.ok) {

            const result =
                await historicalResponse.json();

            if (Array.isArray(result)) {
                historicalRates = result;
            }

        }


        /* =====================================================
           MAJOR CURRENT + PREVIOUS
        ===================================================== */

        const majorRates = {};
        const majorPreviousRates = {};


        for (const quote of majorQuotes) {

            const rows =
                historicalRates
                    .filter(
                        item =>
                            item?.quote === quote &&
                            item?.date &&
                            item.date <= today &&
                            Number.isFinite(
                                Number(item.rate)
                            )
                    )
                    .sort(
                        (a, b) =>
                            a.date.localeCompare(b.date)
                    );


            if (!rows.length) {
                continue;
            }


            /* ================================================
               CURRENT
            ================================================ */

            const current =
                rows[rows.length - 1];


            majorRates[quote] =
                current;


            /* ================================================
               PREVIOUS
            ================================================ */

            if (rows.length >= 2) {

                const previous =
                    rows[rows.length - 2];

                majorPreviousRates[quote] =
                    previous;

            }

        }


        /* =====================================================
           NORMAL CURRENT DATE
           Ignore future dates.
        ===================================================== */

        const validDates =
            Array.isArray(rates)
                ? [
                    ...new Set(
                        rates
                            .map(
                                item =>
                                    item?.date
                            )
                            .filter(
                                date =>
                                    date &&
                                    date <= today
                            )
                    )
                ].sort()
                : [];


        const currentDate =
            validDates.length
                ? validDates[
                    validDates.length - 1
                ]
                : null;


        const currentRates =
            currentDate
                ? rates.filter(
                    item =>
                        item?.date === currentDate
                )
                : [];


        /* =====================================================
           PREVIOUS DATE
        ===================================================== */

        const previousDate =
            validDates.length >= 2
                ? validDates[
                    validDates.length - 2
                ]
                : null;


        const previousRates =
            previousDate
                ? rates.filter(
                    item =>
                        item?.date === previousDate
                )
                : [];


        /* =====================================================
           RESPONSE
        ===================================================== */

        return new Response(

            JSON.stringify({

                base,

                currencies,

                rates:
                    currentRates,

                previousRates,

                date:
                    currentDate,

                previousDate,

                majorRates,

                majorPreviousRates

            }),

            {
                headers: {

                    "Content-Type":
                        "application/json",

                    "Cache-Control":
                        "public, max-age=300"

                }

            }

        );

    } catch (error) {

        console.error(
            "Currencies API failed:",
            error
        );


        return new Response(

            JSON.stringify({

                error:
                    "Failed to load currency data"

            }),

            {
                status: 500,

                headers: {

                    "Content-Type":
                        "application/json"

                }

            }

        );

    }

}
