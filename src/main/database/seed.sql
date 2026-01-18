-- Insert test user
INSERT INTO users (id, username, email, email_hash, password_hash, role) 
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'testuser',
  'test@archiwum.pl',
  encode(digest('test@archiwum.pl', 'sha256'), 'hex'),
  '$2b$10$mockpasswordhash',
  'curator'
)
ON CONFLICT (id) DO NOTHING;

-- Insert test files
INSERT INTO files (id, filename, file_path, file_hash, mime_type, file_size, media_type, created_by, description, a11y_description, cover_color, current_version)
VALUES 
  ('650e8400-e29b-41d4-a716-446655440001', 'Polska Historia', '/archive/historia.pdf', 'hash1', 'application/pdf', 2097152, 'teksty', '550e8400-e29b-41d4-a716-446655440001', 'Kompendium polskiej historii od średniowiecza', 'Dokument tekstowy zawierający historię Polski', 'bg-blue-500', 1),
  ('650e8400-e29b-41d4-a716-446655440002', 'Symphonia Polonica', '/archive/symphony.mp3', 'hash2', 'audio/mpeg', 15728640, 'audio', '550e8400-e29b-41d4-a716-446655440001', 'Symfonia inspirowana polskimi motywami', 'Nagranie muzyki klasycznej, około 30 minut', 'bg-purple-500', 1),
  ('650e8400-e29b-41d4-a716-446655440003', 'Zamek Wawelu', '/archive/wawel.mp4', 'hash3', 'video/mp4', 314572800, 'filmy', '550e8400-e29b-41d4-a716-446655440001', 'Dokumentalny film o Zamku Królewskim na Wawelu', 'Film dokumentalny w Full HD o historii i architekturze zamku', 'bg-amber-500', 1),
  ('650e8400-e29b-41d4-a716-446655440004', 'Pejzaż Tatrzański', '/archive/tatry.jpg', 'hash4', 'image/jpeg', 5242880, 'obrazy', '550e8400-e29b-41d4-a716-446655440001', 'Piękny pejzaż ze szczytu Trzy Korony', 'Fotografia krajobrazowa przedstawiająca Tatry zimą', 'bg-green-500', 1),
  ('650e8400-e29b-41d4-a716-446655440005', 'Open Office Suite', '/archive/openoffice.iso', 'hash5', 'application/x-iso9660-image', 524288000, 'oprogramowanie', '550e8400-e29b-41d4-a716-446655440001', 'Pakiet biurowy open source', 'Plik ISO z kompletnym pakietem biurowym', 'bg-red-500', 1),
  ('650e8400-e29b-41d4-a716-446655440006', 'Powstanie Warszawskie', '/archive/warsaw_uprising.mp4', 'hash6', 'video/mp4', 157286400, 'filmy', '550e8400-e29b-41d4-a716-446655440001', 'Materiały archiwalne z Powstania Warszawskiego', 'Film dokumentalny o Powstaniu Warszawskim 1944', 'bg-slate-600', 1);

-- Insert Dublin Core metadata for first file
INSERT INTO metadata_dublin_core (file_id, identifier, title, creator, subject, description, type, format, language, dc_xml)
VALUES 
  ('650e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'Polska Historia', 'Jan Kowalski', 'Historia Polski, Średniowiecze, Epoka Nowożytna', 'Kompendium polskiej historii', 'document', 'application/pdf', 'pl', '<dc:record></dc:record>');
