-- Idempotent local setup for V3–V5. Run after schema.sql and before seeding.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A')
        || setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'B')
        || setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B')
        || setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C')
        || setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'D');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;

CREATE TRIGGER products_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, brand, category, tags, description
ON products
FOR EACH ROW
EXECUTE FUNCTION update_product_search_vector();

-- Populate search vectors for products that existed before this setup.
-- Updating 'name' invokes the trigger without changing the visible value.
UPDATE products
SET name = name
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_search_vector
ON products USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
ON products USING GIN (name gin_trgm_ops);

ANALYZE products;
