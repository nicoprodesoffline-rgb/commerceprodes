-- Cercle 3 (3.1, 3.15) : un document PDF du catalogue v2 peut peser 30 Mio (les images restent plafonnées à 20 Mio par le récepteur, avant l'écriture ici).
ALTER TABLE site_media DROP CONSTRAINT site_media_size_check;
ALTER TABLE site_media ADD CONSTRAINT site_media_size_check CHECK (size BETWEEN 1 AND 31457280);
