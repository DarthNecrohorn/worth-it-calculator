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


        const currentDate =
            rates[0]?.date || null;


       /* =====================================================
           PREVIOUS RATES
        ===================================================== */

        let previousRates = [];

        if (currentDate) {

            const current =
                new Date(
                    `${currentDate}T12:00:00Z`
                );

            const previous =
                new Date(current);

            previous.setUTCDate(
                previous.getUTCDate() - 7
            );

            const previousFrom =
                previous
                    .toISOString()
                    .slice(0, 10);

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

                    const previousDate =
                        history
                            .map(
                                item =>
                                    item.date
                            )
                            .filter(
                                date =>
                                    date &&
                                    date < currentDate
                            )
                            .sort()
                            .at(-1);

                    if (previousDate) {

                        previousRates =
                            history.filter(
                                item =>
                                    item.date ===
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
                    currentDate

            }),

            {
                headers: {

                    "Content-Type":
                        "application/json",

                    "Cache-Control":
                        "public, max-age=1800"

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
