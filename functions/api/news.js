export async function onRequestGet(context) {

const apiKey = context.env.GNEWS_API_KEY;

if (!apiKey) {
    return Response.json(
        {
            error: "GNEWS_API_KEY is not configured."
        },
        { status: 500 }
    );
}

try {

    const requests = {

        latest:
            "https://gnews.io/api/v4/top-headlines?category=general&lang=en&max=10",

        weird:
            "https://gnews.io/api/v4/search?q=weird%20OR%20strange%20OR%20unusual&lang=en&max=10",

        awesome:
            "https://gnews.io/api/v4/search?q=amazing%20OR%20incredible%20OR%20awesome&lang=en&max=10",

        underrated:
            "https://gnews.io/api/v4/search?q=underrated%20OR%20overlooked%20OR%20little-known&lang=en&max=10"

    };


    const results = await Promise.all(

        Object.entries(requests).map(
            async ([category, url]) => {

                const separator =
                    url.includes("?") ? "&" : "?";

                const response =
                    await fetch(
                        `${url}${separator}apikey=${encodeURIComponent(apiKey)}`
                    );

                if (!response.ok) {
                    throw new Error(
                        `${category} request failed: ${response.status}`
                    );
                }

                const data =
                    await response.json();

                return [
                    category,
                    Array.isArray(data.articles)
                        ? data.articles.slice(0, 10).map(article => ({
                            title: article.title || "",
                            description: article.description || "",
                            url: article.url || "",
                            image: article.image || "",
                            publishedAt: article.publishedAt || "",
                            source: article.source?.name || ""
                        }))
                        : []
                ];

            }
        )
    );


    const news = Object.fromEntries(results);


    return Response.json(news, {
        headers: {
            "Cache-Control":
                "public, max-age=14400, s-maxage=14400"
        }
    });


} catch(error) {

    console.error(
        "News API error:",
        error
    );

    return Response.json(
        {
            error: "Unable to load news."
        },
        { status: 500 }
    );

}

}
