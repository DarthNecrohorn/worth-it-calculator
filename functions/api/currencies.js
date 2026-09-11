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


        return new Response(
            JSON.stringify({

                base,

                currencies,

                rates,

                date:
                    rates[0]?.date || null

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
