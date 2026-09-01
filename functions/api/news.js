```js
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
            category: "world"
        }

    };

    try {

        const results = await Promise.all(

            Object.entries(categories).map(
                async ([category, settings]) => {

                    try {

                        const url =
                            new URL(
                                "https://newsdata.io/api/1/latest"
                            );

                        url.searchParams.set(
                            "apikey",
                            apiKey
                        );

                        url.searchParams.set(
                            "language",
                            "en"
                        );

                        url.searchParams.set(
                            "size",
                            "10"
                        );

                        // World koristi NewsData "world" kategoriju
                        if (settings.category) {

                            url.searchParams.set(
                                "category",
                                settings.category
                            );

                        }

                        // Ostale kategorije koriste search query
                        if (settings.q) {

                            url.searchParams.set(
                                "q",
                                settings.q
                            );

                        }

                        const response =
                            await fetch(url.toString());

                        if (!response.ok) {

                            console.error(
                                `${category} request failed: ${response.status}`
                            );

                            return [
                                category,
                                []
                            ];

                        }

                        const data =
                            await response.json();

                        const articles =
                            Array.isArray(data.results)
                                ? data.results
                                : [];

                        return [
                            category,
                            articles
                                .slice(0, 10)
                                .map(article => ({

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

                    } catch (error) {

                        console.error(
                            `${category} error:`,
                            error
                        );

                        return [
                            category,
                            []
                        ];

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
```
