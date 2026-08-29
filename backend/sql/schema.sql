-- products
-- ├── id
-- ├── name
-- ├── description
-- ├── brand
-- ├── category
-- ├── tags
-- ├── price
-- ├── rating
-- ├── stock
-- └── created_at


CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    brand VARCHAR(100),
    category VARCHAR(100),
    tags TEXT[],
    price DECIMAL(10, 2) NOT NULL,
    rating DECIMAL(3, 2),
    stock INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);