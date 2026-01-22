const { generateId, generateProjectKey, generateBatchId } = require('../../src/utils/generateId');

describe('generateId', () => {
    it('should generate ID without prefix', () => {
        const id = generateId();
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        expect(id.length).toBe(12); // base64url of 9 bytes
    });

    it('should generate ID with prefix', () => {
        const id = generateId('test_');
        expect(id).toMatch(/^test_/);
        expect(id.length).toBe(17); // 5 (prefix) + 12 (random)
    });

    it('should generate unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(generateId());
        }
        expect(ids.size).toBe(100);
    });
});

describe('generateProjectKey', () => {
    it('should generate key with proj_ prefix', () => {
        const key = generateProjectKey();
        expect(key).toMatch(/^proj_/);
        expect(key.length).toBe(17); // 5 (proj_) + 12 (random)
    });
});

describe('generateBatchId', () => {
    it('should generate ID with batch_ prefix', () => {
        const id = generateBatchId();
        expect(id).toMatch(/^batch_/);
        expect(id.length).toBe(18); // 6 (batch_) + 12 (random)
    });
});
