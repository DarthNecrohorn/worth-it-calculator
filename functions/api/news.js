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
        latest: "news",
        weird: "weird OR strange OR unusual",
        awesome: "amazing OR incredible OR inspiring",
        underrated: "overlooked OR underrated OR little known",
        world: "international OR global OR world"
    };

    try {

        const results = await Promise.all(
            Object.entries(categories).map(
                async ([category, query]) => {

                    const url = new URL(
                        "https://newsdata.io/api/1/latest"
                    );

                    url.searchParams.set("apikey", apiKey);
                    url.searchParams.set("q", query);
                    url.searchParams.set("language", "en");
                    url.searchParams.set("size", "10");

                    try {

                        const response = await fetch(url.toString());

                        const data = await response.json();

                        if (!response.ok) {
                            console.error(
                                `${category} request failed:`,
                                data
                            );

                            return [category, []];
                        }

                        const articles = Array.isArray(data.results)
                            ? data.results
                            : [];

                        return [
                            category,
                            articles.slice(0, 10).map(article => ({
                                title: article.title || "",
                                description: article.description || "",
                                url: article.link || "",
                                image: article.image_url || "",
                                publishedAt: article.pubDate || "",
                                source: article.source_name || ""
                            }))
                        ];

                    } catch (error) {

                        console.error(
                            `${category} error:`,
                            error
                        );

                        return [category, []];
                    }
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
