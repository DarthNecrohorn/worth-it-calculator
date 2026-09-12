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
           FIND TODAY
           Ignore future dates returned by the API.
        ===================================================== */

        const now =
            new Date();

        const today =
            [
                now.getUTCFullYear(),
                String(now.getUTCMonth() + 1).padStart(2, "0"),
                String(now.getUTCDate()).padStart(2, "0")
            ].join("-");


        /* =====================================================
           FIND LATEST AVAILABLE DATE
           THAT IS NOT IN THE FUTURE
        ===================================================== */

        const validCurrentDates =
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
            validCurrentDates.length
                ? validCurrentDates[
                    validCurrentDates.length - 1
                ]
                : null;

         const currentRates =
            Array.isArray(rates)
               ? rates.filter(
                  item =>
                    item?.date === currentDate
        )
            : [];
       
        /* =====================================================
           PREVIOUS RATES
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


            /*
             * Search a wider range so weekends/holidays
             * do not prevent us from finding the previous
             * available trading day.
             */

            previous.setUTCDate(
                previous.getUTCDate() - 14
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

                    /*
                     * Find the latest date strictly before
                     * the current date.
                     */

                    const availablePreviousDates =
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


                    previousDate =
                        availablePreviousDates.length
                            ? availablePreviousDates[
                                availablePreviousDates.length - 1
                            ]
                            : null;


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

                rates,

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

                    /*
                     * Short cache so that a new daily rate
                     * becomes visible reasonably quickly.
                     */

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
