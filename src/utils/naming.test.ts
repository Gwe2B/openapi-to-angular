import { describe, expect, it } from 'vitest';
import { toCamelCase, toKebabCase, toPascalCase } from './naming.js';

describe('toPascalCase', () => {
  it('capitalizes single words', () => {
    expect(toPascalCase('pet')).toBe('Pet');
  });

  it('joins hyphenated and snake_case words', () => {
    expect(toPascalCase('new-pet')).toBe('NewPet');
    expect(toPascalCase('new_pet')).toBe('NewPet');
  });

  it('preserves existing camelCase', () => {
    expect(toPascalCase('petId')).toBe('PetId');
  });
});

describe('toCamelCase', () => {
  it('lowercases the first letter', () => {
    expect(toCamelCase('CreatePet')).toBe('createPet');
    expect(toCamelCase('create-pet')).toBe('createPet');
  });
});

describe('toKebabCase', () => {
  it('splits camelCase boundaries', () => {
    expect(toKebabCase('NewPet')).toBe('new-pet');
  });

  it('normalizes separators', () => {
    expect(toKebabCase('new_pet name')).toBe('new-pet-name');
  });
});
