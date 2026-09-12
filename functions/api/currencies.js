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
           TODAY
           Ignore future dates returned by Frankfurter.
        ===================================================== */

        const now =
            new Date();


        const today =
            [
                now.getUTCFullYear(),
                String(
                    now.getUTCMonth() + 1
                ).padStart(2, "0"),
                String(
                    now.getUTCDate()
                ).padStart(2, "0")
            ].join("-");


        /* =====================================================
           AVAILABLE DATES
        ===================================================== */

        const availableDates =
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


        /* =====================================================
           CURRENT DATE
           Use the latest available date that contains USD.
           
           USD is required for the Major currency pairs
           and gives us a reliable common trading date.
        ===================================================== */

        const currentDatesWithUSD =
            availableDates.filter(
                date =>
                    rates.some(
                        item =>
                            item?.date === date &&
                            item?.quote === "USD"
                    )
            );


        const currentDate =
            currentDatesWithUSD.length
                ? currentDatesWithUSD[
                    currentDatesWithUSD.length - 1
                ]
                : null;


        /* =====================================================
           CURRENT RATES
           Return only the selected current date.
        ===================================================== */

        const currentRates =
            currentDate &&
            Array.isArray(rates)

                ? rates.filter(
                    item =>
                        item?.date ===
                        currentDate
                )

                : [];


        /* =====================================================
           PREVIOUS RATES
           Search the previous 30 days.
        ===================================================== */

        let previousRates = [];

        let previousDate = null;


        if (currentDate) {

            const current =
                new Date(
                    `${currentDate}T12:00:00Z`
                );


            const previous =
                new Date(current);


            previous.setUTCDate(
                previous.getUTCDate() - 30
            );


            const previousFrom =
                [
                    previous.getUTCFullYear(),
                    String(
                        previous.getUTCMonth() + 1
                    ).padStart(2, "0"),
                    String(
                        previous.getUTCDate()
                    ).padStart(2, "0")
                ].join("-");


            const previousResponse =
                await fetch(
                    `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&from=${previousFrom}&to=${currentDate}`
                );


            if (previousResponse.ok) {

                const history =
                    await previousResponse.json();


                if (
                    Array.isArray(history) &&
                    history.length
                ) {

                    /* =========================================
                       HISTORICAL DATES
                    ========================================= */

                    const historicalDates =
                        [
                            ...new Set(
                                history
                                    .map(
                                        item =>
                                            item?.date
                                    )
                                    .filter(
                                        date =>
                                            date &&
                                            date < currentDate
                                    )
                            )
                        ].sort();


                    /* =========================================
                       PREVIOUS DATE
                       Find the latest previous date
                       that contains USD.
                    ========================================= */

                    const historicalDatesWithUSD =
                        historicalDates.filter(
                            date =>
                                history.some(
                                    item =>
                                        item?.date === date &&
                                        item?.quote === "USD"
                                )
                        );


                    previousDate =
                        historicalDatesWithUSD.length
                            ? historicalDatesWithUSD[
                                historicalDatesWithUSD.length - 1
                            ]
                            : null;


                    /* =========================================
                       PREVIOUS RATES
                    ========================================= */

                    if (previousDate) {

                        previousRates =
                            history.filter(
                                item =>
                                    item?.date ===
                                    previousDate
                            );

                    }

                }

            }

        }


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

                previousDate:
                    previousDate

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
