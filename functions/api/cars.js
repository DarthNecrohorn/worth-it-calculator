export async function onRequestGet(context) {
    try {
        const { env } = context;

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

        const url = new URL(
            "https://api.carsxe.com/v1/ymm"
        );

        url.searchParams.set("key", env.CARSXE_API_KEY);
        url.searchParams.set("year", "2024");
        url.searchParams.set("make", "BMW");
        url.searchParams.set("model", "3 Series");

        const response = await fetch(url.toString());

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
