export async function onRequestGet(context) {

    const apiKey = context.env.NEWSDATA_API_KEY;

    if (!apiKey) {
        return Response.json(
            {
                error: "NEWSDATA_API_KEY is not configured."
            },
            { status: 500 }
        );
    }
const categories = {

    latest: {
        q: "news"
    },

    weird: {
        q: "weird OR strange OR unusual"
    },

    awesome: {
        q: "amazing OR incredible OR inspiring"
    },

    underrated: {
    q: "overlooked OR underrated OR little known"
},

world: {
    q: "news"
}

};

try {

    const results = await Promise.all(

        Object.entries(categories).map(
            async ([category, settings]) => {

                const url =
                    new URL(
                        "https://newsdata.io/api/1/latest"
                    );

                url.searchParams.set(
                    "apikey",
                    apiKey
                );

                url.searchParams.set(
                    "q",
                    settings.q
                );

                url.searchParams.set(
                    "language",
                    "en"
                );

                url.searchParams.set(
                    "size",
                    "10"
                );

                const response =
                    await fetch(url.toString());

                if (!response.ok) {
                    throw new Error(
                        `${category} request failed: ${response.status}`
                    );
                }

                const data =
                    await response.json();

                const articles =
                    Array.isArray(data.results)
                        ? data.results
                        : [];

                return [
                    category,
                    articles.slice(0, 10).map(article => ({

                        title:
                            article.title || "",

                        description:
                            article.description || "",

                        url:
                            article.link || "",

                        image:
                            article.image_url || "",

                        publishedAt:
                            article.pubDate || "",

                        source:
                            article.source_name || ""

                    }))
                ];

            }
        )
    );

    return Response.json(
        Object.fromEntries(results),
        {
            headers: {
                "Cache-Control":
                    "public, max-age=14400, s-maxage=14400"
            }
        }
    );

} catch (error) {

    console.error(
        "NewsData API error:",
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


