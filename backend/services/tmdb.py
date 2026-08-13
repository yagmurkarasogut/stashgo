"""
TMDB service - full integration layer with mock fallback.
Uses real TMDB API when TMDB_API_KEY env is set; otherwise deterministic mocks.
"""
import os
import hashlib
from typing import Optional, Dict, List
import httpx

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500"

# Curated mock poster images (Unsplash cinematic portraits)
MOCK_POSTERS = [
    "https://images.pexels.com/photos/19830143/pexels-photo-19830143.jpeg",
    "https://images.unsplash.com/photo-1782899937486-e0eee1d0065c?w=500",
    "https://images.unsplash.com/photo-1782020934325-cfe4cea4fd9c?w=500",
    "https://images.unsplash.com/photo-1489599735734-79b4169c2a78?w=500",
    "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=500",
    "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=500",
    "https://images.unsplash.com/photo-1533488069517-424e1c1ab2f7?w=500",
]

MOCK_CATALOG: Dict[str, Dict] = {
    "inception": {
        "id": 27205, "media_type": "movie", "title": "Inception", "year": 2010,
        "overview": "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
        "director": "Christopher Nolan",
        "cast": ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page", "Tom Hardy"],
        "genres": ["Action", "Sci-Fi", "Thriller"],
    },
    "interstellar": {
        "id": 157336, "media_type": "movie", "title": "Interstellar", "year": 2014,
        "overview": "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
        "director": "Christopher Nolan",
        "cast": ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"],
        "genres": ["Adventure", "Drama", "Sci-Fi"],
    },
    "oppenheimer": {
        "id": 872585, "media_type": "movie", "title": "Oppenheimer", "year": 2023,
        "overview": "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.",
        "director": "Christopher Nolan",
        "cast": ["Cillian Murphy", "Emily Blunt", "Robert Downey Jr."],
        "genres": ["Biography", "Drama", "History"],
    },
    "dune": {
        "id": 438631, "media_type": "movie", "title": "Dune", "year": 2021,
        "overview": "Feature adaptation of Frank Herbert's science fiction novel about the son of a noble family entrusted with the protection of the most valuable asset in the galaxy.",
        "director": "Denis Villeneuve",
        "cast": ["Timothée Chalamet", "Rebecca Ferguson", "Zendaya"],
        "genres": ["Adventure", "Sci-Fi"],
    },
    "the dark knight": {
        "id": 155, "media_type": "movie", "title": "The Dark Knight", "year": 2008,
        "overview": "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological tests.",
        "director": "Christopher Nolan",
        "cast": ["Christian Bale", "Heath Ledger", "Aaron Eckhart"],
        "genres": ["Action", "Crime", "Drama"],
    },
    "breaking bad": {
        "id": 1396, "media_type": "tv", "title": "Breaking Bad", "year": 2008,
        "overview": "A high school chemistry teacher diagnosed with terminal lung cancer turns to manufacturing and selling methamphetamine.",
        "director": "Vince Gilligan",
        "cast": ["Bryan Cranston", "Aaron Paul", "Anna Gunn"],
        "genres": ["Crime", "Drama", "Thriller"],
    },
    "severance": {
        "id": 95396, "media_type": "tv", "title": "Severance", "year": 2022,
        "overview": "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.",
        "director": "Dan Erickson",
        "cast": ["Adam Scott", "Britt Lower", "Patricia Arquette"],
        "genres": ["Drama", "Mystery", "Sci-Fi"],
    },
    "the bear": {
        "id": 136315, "media_type": "tv", "title": "The Bear", "year": 2022,
        "overview": "A young chef from the fine dining world returns to Chicago to run his family sandwich shop.",
        "director": "Christopher Storer",
        "cast": ["Jeremy Allen White", "Ebon Moss-Bachrach", "Ayo Edebiri"],
        "genres": ["Comedy", "Drama"],
    },
    "succession": {
        "id": 76331, "media_type": "tv", "title": "Succession", "year": 2018,
        "overview": "The Roy family controls the biggest media conglomerate in the world, and their fight for control amid uncertain health.",
        "director": "Jesse Armstrong",
        "cast": ["Brian Cox", "Jeremy Strong", "Kieran Culkin"],
        "genres": ["Drama"],
    },
}


def _poster_for(title: str) -> str:
    idx = int(hashlib.md5(title.lower().encode()).hexdigest(), 16) % len(MOCK_POSTERS)
    return MOCK_POSTERS[idx]


def _mock_lookup(title: str, media_type: Optional[str] = None) -> Optional[Dict]:
    key = title.strip().lower()
    if key in MOCK_CATALOG:
        item = MOCK_CATALOG[key].copy()
        if media_type and item["media_type"] != media_type:
            return None
        item["poster_url"] = _poster_for(item["title"])
        item["backdrop_url"] = _poster_for(item["title"] + "-bd")
        item["tmdb_id"] = item["id"]
        return item
    # fuzzy contains
    for k, v in MOCK_CATALOG.items():
        if k in key or key in k:
            item = v.copy()
            if media_type and item["media_type"] != media_type:
                continue
            item["poster_url"] = _poster_for(item["title"])
            item["backdrop_url"] = _poster_for(item["title"] + "-bd")
            item["tmdb_id"] = item["id"]
            return item
    # unknown -> fabricate a plausible stub
    stub_id = int(hashlib.md5(key.encode()).hexdigest(), 16) % 900000 + 100000
    return {
        "tmdb_id": stub_id,
        "id": stub_id,
        "media_type": media_type or "movie",
        "title": title.title(),
        "year": None,
        "overview": f"An intriguing {media_type or 'title'} discovered through your feed. Details pending TMDB enrichment.",
        "director": None,
        "cast": [],
        "genres": [],
        "poster_url": _poster_for(title),
        "backdrop_url": _poster_for(title + "-bd"),
    }


async def search_and_enrich(title: str, media_type: Optional[str] = None) -> Optional[Dict]:
    """Search TMDB for title; return normalized enriched dict. Falls back to mock."""
    api_key = os.environ.get("TMDB_API_KEY", "").strip()
    if not api_key:
        return _mock_lookup(title, media_type)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            search_type = "tv" if media_type == "tv" else "movie"
            url = f"{TMDB_BASE}/search/{search_type}"
            r = await client.get(url, params={"api_key": api_key, "query": title})
            r.raise_for_status()
            data = r.json()
            results = data.get("results", [])
            if not results:
                return _mock_lookup(title, media_type)
            top = results[0]
            tmdb_id = top["id"]
            details = await client.get(
                f"{TMDB_BASE}/{search_type}/{tmdb_id}",
                params={"api_key": api_key, "append_to_response": "credits"},
            )
            det = details.json()
            credits = det.get("credits", {})
            crew = credits.get("crew", [])
            director = next((c["name"] for c in crew if c.get("job") == "Director"), None)
            cast_list = [c["name"] for c in credits.get("cast", [])[:5]]
            title_field = det.get("title") or det.get("name") or title
            date = det.get("release_date") or det.get("first_air_date") or ""
            year = int(date[:4]) if date and date[:4].isdigit() else None
            return {
                "tmdb_id": tmdb_id,
                "id": tmdb_id,
                "media_type": search_type,
                "title": title_field,
                "year": year,
                "overview": det.get("overview", ""),
                "director": director,
                "cast": cast_list,
                "genres": [g["name"] for g in det.get("genres", [])],
                "poster_url": f"{TMDB_IMG_BASE}{det['poster_path']}" if det.get("poster_path") else _poster_for(title_field),
                "backdrop_url": f"{TMDB_IMG_BASE}{det['backdrop_path']}" if det.get("backdrop_path") else _poster_for(title_field + "-bd"),
            }
    except Exception:
        return _mock_lookup(title, media_type)


def is_mocked() -> bool:
    return not os.environ.get("TMDB_API_KEY", "").strip()
