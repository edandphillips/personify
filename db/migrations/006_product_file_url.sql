ALTER TABLE products
    ADD COLUMN IF NOT EXISTS file_url VARCHAR(2048);

UPDATE products
   SET file_url = 'https://dummyimage.com/pdf-mockup.pdf?fitness-guide'
 WHERE id = 'bbbbbbbb-1111-4111-8111-111111111111'
   AND file_url IS NULL;

UPDATE products
   SET file_url = 'https://dummyimage.com/pdf-mockup.pdf?lightroom-presets'
 WHERE id = 'bbbbbbbb-2222-4222-8222-222222222222'
   AND file_url IS NULL;
