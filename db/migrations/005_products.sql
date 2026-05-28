CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO products (id, title, price_cents, type) VALUES
    ('bbbbbbbb-1111-4111-8111-111111111111', '10-Week Fitness Guide PDF', 2500, 'digital_download'),
    ('bbbbbbbb-2222-4222-8222-222222222222', 'Preset Lightroom Filters',  1500, 'digital_download')
ON CONFLICT (id) DO NOTHING;
