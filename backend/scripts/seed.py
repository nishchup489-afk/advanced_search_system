import argparse
import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import psycopg
from faker import Faker

from advanced_search_system.config import settings

fake = Faker()
Faker.seed(42)
random.seed(42)


CATALOG = {
    "Laptops": {
        "brands": [
            "Apple", "Dell", "Lenovo", "ASUS",
            "HP", "Acer", "Microsoft", "MSI",
        ],
        "products": [
            "Laptop",
            "Gaming Laptop",
            "Ultrabook",
            "Business Laptop",
            "2-in-1 Laptop",
            "Creator Laptop",
        ],
        "tags": [
            "laptop", "portable", "computer", "usb-c",
            "wifi", "bluetooth", "ssd", "productivity",
        ],
        "price": (399, 3499),
    },

    "Headphones": {
        "brands": [
            "Sony", "Bose", "Apple", "Samsung",
            "Sennheiser", "JBL", "Beats", "Anker",
        ],
        "products": [
            "Wireless Headphones",
            "Noise Cancelling Headphones",
            "Bluetooth Headphones",
            "Over-Ear Headphones",
            "Wireless Earbuds",
            "Gaming Headset",
        ],
        "tags": [
            "wireless", "bluetooth", "audio", "music",
            "noise-cancelling", "headphones", "microphone",
        ],
        "price": (29, 699),
    },

    "Phones": {
        "brands": [
            "Apple", "Samsung", "Google", "OnePlus",
            "Motorola", "Nothing", "Sony",
        ],
        "products": [
            "Smartphone",
            "5G Smartphone",
            "Pro Smartphone",
            "Foldable Smartphone",
            "Android Smartphone",
        ],
        "tags": [
            "phone", "smartphone", "5g", "camera",
            "mobile", "oled", "usb-c", "wireless",
        ],
        "price": (199, 1899),
    },

    "Monitors": {
        "brands": [
            "LG", "Samsung", "Dell", "ASUS",
            "Acer", "BenQ", "MSI", "Gigabyte",
        ],
        "products": [
            "4K Monitor",
            "Gaming Monitor",
            "Ultrawide Monitor",
            "OLED Monitor",
            "Professional Monitor",
            "Curved Monitor",
        ],
        "tags": [
            "monitor", "display", "4k", "gaming",
            "hdr", "usb-c", "high-refresh-rate",
        ],
        "price": (129, 1999),
    },

    "Keyboards": {
        "brands": [
            "Logitech", "Razer", "Corsair",
            "Keychron", "SteelSeries", "HyperX",
        ],
        "products": [
            "Mechanical Keyboard",
            "Wireless Keyboard",
            "Gaming Keyboard",
            "Low Profile Keyboard",
            "RGB Mechanical Keyboard",
        ],
        "tags": [
            "keyboard", "mechanical", "wireless",
            "gaming", "rgb", "bluetooth", "usb-c",
        ],
        "price": (29, 349),
    },

    "Mice": {
        "brands": [
            "Logitech", "Razer", "Corsair",
            "SteelSeries", "Glorious", "HyperX",
        ],
        "products": [
            "Wireless Mouse",
            "Gaming Mouse",
            "Ergonomic Mouse",
            "Bluetooth Mouse",
            "Ultralight Gaming Mouse",
        ],
        "tags": [
            "mouse", "wireless", "gaming",
            "bluetooth", "ergonomic", "rgb",
        ],
        "price": (15, 249),
    },

    "Storage": {
        "brands": [
            "Samsung", "Western Digital", "Seagate",
            "Crucial", "SanDisk", "Kingston",
        ],
        "products": [
            "NVMe SSD",
            "Portable SSD",
            "External Hard Drive",
            "Internal SSD",
            "USB Flash Drive",
        ],
        "tags": [
            "storage", "ssd", "nvme", "usb",
            "portable", "backup", "high-speed",
        ],
        "price": (19, 899),
    },

    "Gaming": {
        "brands": [
            "Nintendo", "Sony", "Microsoft",
            "Razer", "Logitech", "Corsair",
        ],
        "products": [
            "Game Controller",
            "Gaming Headset",
            "Gaming Keyboard",
            "Gaming Mouse",
            "Gaming Console",
            "Charging Dock",
        ],
        "tags": [
            "gaming", "controller", "console",
            "rgb", "wireless", "multiplayer",
        ],
        "price": (19, 799),
    },

    "Smart Home": {
        "brands": [
            "Google", "Amazon", "Philips",
            "Ring", "Eufy", "TP-Link",
        ],
        "products": [
            "Smart Speaker",
            "Smart Light",
            "Security Camera",
            "Smart Doorbell",
            "Smart Plug",
            "Wi-Fi Thermostat",
        ],
        "tags": [
            "smart-home", "wifi", "voice-control",
            "automation", "wireless", "security",
        ],
        "price": (15, 599),
    },

    "Kitchen": {
        "brands": [
            "Ninja", "KitchenAid", "Breville",
            "Cuisinart", "Philips", "Instant",
        ],
        "products": [
            "Air Fryer",
            "Blender",
            "Coffee Maker",
            "Espresso Machine",
            "Stand Mixer",
            "Food Processor",
        ],
        "tags": [
            "kitchen", "appliance", "cooking",
            "home", "electric", "food",
        ],
        "price": (29, 999),
    },
}


ADJECTIVES = [
    "Pro",
    "Ultra",
    "Max",
    "Plus",
    "Elite",
    "Premium",
    "Advanced",
    "Compact",
    "Performance",
    "Essential",
]


FEATURES = [
    "fast performance",
    "long battery life",
    "premium build quality",
    "easy setup",
    "high-speed connectivity",
    "energy-efficient operation",
    "compact design",
    "reliable everyday performance",
    "advanced wireless connectivity",
    "professional-grade performance",
]


def money(low: float, high: float) -> Decimal:
    value = random.uniform(low, high)
    return Decimal(f"{value:.2f}")


def generate_rating() -> Decimal:
    # Deliberately skewed toward realistic online-store ratings.
    rating = random.triangular(1.0, 5.0, 4.4)
    return Decimal(f"{rating:.1f}")


def generate_stock() -> int:
    # Some products should actually be unavailable.
    if random.random() < 0.08:
        return 0

    return random.randint(1, 1000)


def generate_product() -> tuple:
    category = random.choice(list(CATALOG))
    config = CATALOG[category]

    brand = random.choice(config["brands"])
    product_type = random.choice(config["products"])

    adjective = random.choice(ADJECTIVES)

    model_number = random.choice(
        [
            f"{random.randint(100, 999)}",
            f"X{random.randint(1, 99)}",
            f"M{random.randint(1, 9)}",
            f"G{random.randint(1, 9)}",
            f"{random.randint(10, 99)}X",
        ]
    )

    name_patterns = [
        f"{brand} {product_type} {model_number}",
        f"{brand} {adjective} {product_type}",
        f"{brand} {product_type} {adjective} {model_number}",
    ]

    name = random.choice(name_patterns)

    selected_tags = random.sample(
        config["tags"],
        k=min(
            random.randint(2, 5),
            len(config["tags"]),
        ),
    )

    feature_1, feature_2 = random.sample(FEATURES, 2)

    description = (
        f"The {name} is a {product_type.lower()} designed for "
        f"{fake.word()} users looking for {feature_1} and {feature_2}. "
        f"It features {', '.join(selected_tags[:3])} and is suitable for "
        f"both everyday and professional use."
    )

    low_price, high_price = config["price"]

    price = money(low_price, high_price)
    rating = generate_rating()
    stock = generate_stock()

    created_at = datetime.now(UTC) - timedelta(
        days=random.randint(0, 365 * 5),
        seconds=random.randint(0, 86_400),
    )

    return (
        name,
        description,
        brand,
        category,
        selected_tags,
        price,
        rating,
        stock,
        created_at,
    )


def seed_products(count: int) -> None:
    print(f"Generating {count:,} products...")

    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cursor:
            with cursor.copy(
                """
                COPY products (
                    name,
                    description,
                    brand,
                    category,
                    tags,
                    price,
                    rating,
                    stock,
                    created_at
                )
                FROM STDIN
                """
            ) as copy:
                for index in range(1, count + 1):
                    copy.write_row(generate_product())

                    if index % 10_000 == 0:
                        print(f"  {index:,}/{count:,} generated")

        conn.commit()

    print(f"Done. Inserted {count:,} products.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic product data."
    )

    parser.add_argument(
        "--count",
        type=int,
        default=100_000,
        help="Number of products to generate.",
    )

    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.count <= 0:
        raise ValueError("--count must be greater than zero")

    seed_products(args.count)