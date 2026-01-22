const {
    createProjectSchema,
    updateProjectSchema,
    uploadSchema,
    recordingsQuerySchema,
    batchTranscribeSchema,
    exportQuerySchema,
    validate
} = require('../../src/validators/schemas');

describe('createProjectSchema', () => {
    it('should validate valid project data', () => {
        const result = validate(createProjectSchema, {
            name: 'Test Project',
            language: 'es',
            transcription_mode: 'realtime'
        });

        expect(result.success).toBe(true);
        expect(result.data.name).toBe('Test Project');
    });

    it('should apply defaults', () => {
        const result = validate(createProjectSchema, {
            name: 'Test Project'
        });

        expect(result.success).toBe(true);
        expect(result.data.language).toBe('es');
        expect(result.data.transcription_mode).toBe('realtime');
    });

    it('should reject empty name', () => {
        const result = validate(createProjectSchema, {
            name: ''
        });

        expect(result.success).toBe(false);
    });

    it('should reject invalid transcription_mode', () => {
        const result = validate(createProjectSchema, {
            name: 'Test',
            transcription_mode: 'invalid'
        });

        expect(result.success).toBe(false);
    });
});

describe('uploadSchema', () => {
    it('should validate valid upload data', () => {
        const result = validate(uploadSchema, {
            session_id: 'test_session_123',
            question_id: 'q1',
            duration_seconds: '45'
        });

        expect(result.success).toBe(true);
        expect(result.data.duration_seconds).toBe(45);
    });

    it('should require session_id', () => {
        const result = validate(uploadSchema, {
            question_id: 'q1'
        });

        expect(result.success).toBe(false);
    });

    it('should reject duration over 300 seconds', () => {
        const result = validate(uploadSchema, {
            session_id: 'test',
            duration_seconds: 301
        });

        expect(result.success).toBe(false);
    });
});

describe('recordingsQuerySchema', () => {
    it('should apply defaults', () => {
        const result = validate(recordingsQuerySchema, {});

        expect(result.success).toBe(true);
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(50);
    });

    it('should parse string numbers', () => {
        const result = validate(recordingsQuerySchema, {
            page: '2',
            limit: '25'
        });

        expect(result.success).toBe(true);
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(25);
    });

    it('should reject limit over 100', () => {
        const result = validate(recordingsQuerySchema, {
            limit: 150
        });

        expect(result.success).toBe(false);
    });
});

describe('batchTranscribeSchema', () => {
    it('should validate session_ids array', () => {
        const result = validate(batchTranscribeSchema, {
            session_ids: ['id1', 'id2', 'id3']
        });

        expect(result.success).toBe(true);
        expect(result.data.session_ids).toHaveLength(3);
    });

    it('should reject empty array', () => {
        const result = validate(batchTranscribeSchema, {
            session_ids: []
        });

        expect(result.success).toBe(false);
    });
});

describe('exportQuerySchema', () => {
    it('should apply defaults', () => {
        const result = validate(exportQuerySchema, {});

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('csv');
        expect(result.data.status).toBe('completed');
    });

    it('should accept xlsx format', () => {
        const result = validate(exportQuerySchema, {
            format: 'xlsx'
        });

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('xlsx');
    });

    it('should reject invalid format', () => {
        const result = validate(exportQuerySchema, {
            format: 'pdf'
        });

        expect(result.success).toBe(false);
    });
});
