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
           MAJOR CURRENCIES
           These are required for the movement cards.
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
           FIND AVAILABLE DATES
           Only dates that are not in the future.
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
           FIND CURRENT MAJOR DATE
           Choose the latest date that contains
           all required major currencies.
        ===================================================== */

        let currentDate = null;


        for (
            let i = availableDates.length - 1;
            i >= 0;
            i--
        ) {

            const date =
                availableDates[i];


            const quotesForDate =
                new Set(
                    rates
                        .filter(
                            item =>
                                item?.date === date
                        )
                        .map(
                            item =>
                                item?.quote
                        )
                );


            const hasAllMajorCurrencies =
                majorQuotes.every(
                    quote =>
                        quotesForDate.has(quote)
                );


            if (hasAllMajorCurrencies) {

                currentDate =
                    date;

                break;

            }

        }


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
           Search a wider historical period so weekends
           and holidays do not cause missing data.
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
                       AVAILABLE HISTORICAL DATES
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
                       FIND PREVIOUS MAJOR DATE
                    ========================================= */

                    for (
                        let i =
                            historicalDates.length - 1;
                        i >= 0;
                        i--
                    ) {

                        const date =
                            historicalDates[i];


                        const quotesForDate =
                            new Set(
                                history
                                    .filter(
                                        item =>
                                            item?.date ===
                                            date
                                    )
                                    .map(
                                        item =>
                                            item?.quote
                                    )
                            );


                        const hasAllMajorCurrencies =
                            majorQuotes.every(
                                quote =>
                                    quotesForDate.has(
                                        quote
                                    )
                            );


                        if (
                            hasAllMajorCurrencies
                        ) {

                            previousDate =
                                date;

                            break;

                        }

                    }


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
