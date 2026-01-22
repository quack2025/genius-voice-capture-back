const { recordingsToCSV, parseSessionIds } = require('../../src/utils/csvParser');

describe('recordingsToCSV', () => {
    it('should convert recordings array to CSV', () => {
        const recordings = [
            {
                session_id: 'session_1',
                question_id: 'q1',
                transcription: 'Test transcription',
                duration_seconds: 30,
                status: 'completed',
                language_detected: 'es',
                created_at: '2026-01-21T10:00:00Z',
                transcribed_at: '2026-01-21T10:01:00Z'
            }
        ];

        const csv = recordingsToCSV(recordings);

        expect(csv).toContain('session_id');
        expect(csv).toContain('session_1');
        expect(csv).toContain('Test transcription');
    });

    it('should handle empty array', () => {
        const csv = recordingsToCSV([]);
        expect(csv).toContain('session_id'); // Headers should still be present
    });

    it('should handle missing fields', () => {
        const recordings = [
            {
                session_id: 'session_1',
                status: 'pending'
            }
        ];

        const csv = recordingsToCSV(recordings);
        expect(csv).toContain('session_1');
    });
});

describe('parseSessionIds', () => {
    it('should parse comma-separated string', () => {
        const result = parseSessionIds('id1, id2, id3');
        expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    it('should parse semicolon-separated string', () => {
        const result = parseSessionIds('id1;id2;id3');
        expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    it('should parse newline-separated string', () => {
        const result = parseSessionIds('id1\nid2\nid3');
        expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    it('should handle array input', () => {
        const result = parseSessionIds(['id1', 'id2', 'id3']);
        expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    it('should filter empty values', () => {
        const result = parseSessionIds('id1,,id2,  ,id3');
        expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    it('should trim whitespace', () => {
        const result = parseSessionIds('  id1  ,  id2  ');
        expect(result).toEqual(['id1', 'id2']);
    });

    it('should return empty array for invalid input', () => {
        expect(parseSessionIds(null)).toEqual([]);
        expect(parseSessionIds(undefined)).toEqual([]);
        expect(parseSessionIds(123)).toEqual([]);
    });
});
