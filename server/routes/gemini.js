import express from 'express';
import { sessionNamesDb } from '../database/db.js';
import { deleteGeminiSession, ensureSessionAccess } from '../projects.js';

const router = express.Router();

router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const projectName = typeof req.query.projectName === 'string' ? req.query.projectName : '';

        if (!sessionId || typeof sessionId !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(sessionId)) {
            return res.status(400).json({ success: false, error: 'Invalid session ID format' });
        }

        await ensureSessionAccess(sessionId, 'gemini', req.user?.id ?? null, { projectName });
        await deleteGeminiSession(sessionId, req.user?.id ?? null);
        sessionNamesDb.deleteName(sessionId, 'gemini');
        res.json({ success: true });
    } catch (error) {
        console.error(`Error deleting Gemini session ${req.params.sessionId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
