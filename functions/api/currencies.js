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
           TODAY
           Never allow future dates.
        ===================================================== */

        const now = new Date();

        const today =
            [
                now.getUTCFullYear(),
                String(now.getUTCMonth() + 1).padStart(2, "0"),
                String(now.getUTCDate()).padStart(2, "0")
            ].join("-");


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
           FIND LATEST VALID RATE FOR EACH MAJOR CURRENCY
           
           Frankfurter may return:
           
           2026-09-13 -> USD/HKD/etc.
           2026-09-12 -> other currencies
           2026-09-11 -> other currencies
           
           Therefore each currency gets its own latest
           non-future observation.
        ===================================================== */

        const latestMajorRates = {};

        const previousMajorRates = {};


        for (const quote of majorQuotes) {

            const validRows =
                Array.isArray(rates)
                    ? rates
                        .filter(
                            item =>
                                item?.quote === quote &&
                                item?.date &&
                                item.date <= today
                        )
                        .sort(
                            (a, b) =>
                                a.date.localeCompare(b.date)
                        )
                    : [];


            if (!validRows.length) {
                continue;
            }


            /* =================================================
               CURRENT
            ================================================= */

            const current =
                validRows[
                    validRows.length - 1
                ];


            latestMajorRates[quote] =
                current;


            /* =================================================
               PREVIOUS
            ================================================= */

            if (validRows.length >= 2) {

                const previous =
                    validRows[
                        validRows.length - 2
                    ];

                previousMajorRates[quote] =
                    previous;

            }

        }


        /* =====================================================
           NORMAL CURRENT RATES
           
           Keep the existing currencies functionality intact.
           Only use the latest non-future date available.
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

                majorRates:
                    latestMajorRates,

                majorPreviousRates:
                    previousMajorRates

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
