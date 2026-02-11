import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../supabase/migrations');
const outputFile = path.join(__dirname, '../supabase/setup_database.sql');

// Header
let combinedSQL = `-- ============================================================================
-- TRUST CENTER - SUPABASE CLOUD DATABASE SETUP
-- ============================================================================
-- Run this file in your Supabase SQL Editor to set up the complete database
-- This version is for Supabase Cloud (auth schema is managed automatically)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;

// Get all migration files except 000_auth_schema.sql
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql') && f !== '000_auth_schema.sql')
  .sort();

console.log(`Found ${files.length} migration files to combine (excluding auth schema)`);

// Combine all files
files.forEach((file, index) => {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  combinedSQL += `\n-- ============================================================================\n`;
  combinedSQL += `-- MIGRATION ${String(index + 1).padStart(3, '0')}: ${file.replace('.sql', '').replace(/_/g, ' ').toUpperCase()}\n`;
  combinedSQL += `-- ============================================================================\n\n`;
  combinedSQL += content;
  combinedSQL += `\n`;
  
  console.log(`Added: ${file}`);
});

// Write combined file
fs.writeFileSync(outputFile, combinedSQL);
console.log(`\nSuccessfully created: ${outputFile}`);
console.log(`Total size: ${(combinedSQL.length / 1024).toFixed(2)} KB`);
