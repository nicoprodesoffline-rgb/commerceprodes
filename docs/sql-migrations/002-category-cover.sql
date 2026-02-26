-- Migration 002 : Champ cover_image_url sur categories
-- À exécuter dans Supabase SQL Editor :
-- https://supabase.com/dashboard/project/mvnaeddtvyaqkdliivdk/sql

ALTER TABLE categories ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Optionnel : remplir avec l'image_url existante si présente
-- UPDATE categories SET cover_image_url = image_url WHERE image_url IS NOT NULL;
