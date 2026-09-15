export async function onRequestGet(context) {
    try {
        const { env, request } = context;

        if (!env.CARSXE_API_KEY) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "CARSXE_API_KEY is not configured"
                }),
                {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        const requestUrl = new URL(request.url);

        const action = requestUrl.searchParams.get("action");

        const carsxeUrl = new URL(
            "https://api.carsxe.com/v1/ymm-options"
        );

        carsxeUrl.searchParams.set(
            "key",
            env.CARSXE_API_KEY
        );

        // Get model list for a manufacturer
        if (action === "models") {

            const make = requestUrl.searchParams.get("make");

            if (!make) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Missing make parameter"
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }

            carsxeUrl.searchParams.set(
                "dimension",
                "models"
            );

            carsxeUrl.searchParams.set(
                "make",
                make
            );
        }

        // Get detailed vehicle information
        else if (action === "vehicle") {

            const year = requestUrl.searchParams.get("year");
            const make = requestUrl.searchParams.get("make");
            const model = requestUrl.searchParams.get("model");

            if (!year || !make || !model) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Missing year, make, or model parameter"
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }

            const vehicleUrl = new URL(
                "https://api.carsxe.com/v1/ymm"
            );

            vehicleUrl.searchParams.set(
                "key",
                env.CARSXE_API_KEY
            );

            vehicleUrl.searchParams.set(
                "year",
                year
            );

            vehicleUrl.searchParams.set(
                "make",
                make
            );

            vehicleUrl.searchParams.set(
                "model",
                model
            );

            const response = await fetch(
                vehicleUrl.toString()
            );

            const data = await response.json();

            return new Response(
                JSON.stringify(data),
                {
                    status: response.status,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        else {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Invalid action"
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        const response = await fetch(
            carsxeUrl.toString()
        );

        const data = await response.json();

        return new Response(
            JSON.stringify(data),
            {
                status: response.status,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

    } catch (error) {

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }
}
