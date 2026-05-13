import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
  getUserCertificatesHandler,
  getCertificateDetailsHandler,
  verifyCertificateHandler,
  downloadCertificateHandler
} from '../controllers/certificates.controller.js';

const router = express.Router();

/**
 * @route   GET /api/certificates
 * @desc    Get all certificates for the authenticated user
 * @access  Private (authenticated users)
 */
router.get('/', authenticateJWT, getUserCertificatesHandler);

/**
 * @route   GET /api/certificates/:id
 * @desc    Get certificate details by ID
 * @access  Private (certificate owner only)
 */
router.get('/:id', authenticateJWT, getCertificateDetailsHandler);

/**
 * @route   GET /api/certificates/:id/verify
 * @desc    Verify certificate by serial number (public endpoint)
 * @access  Public (no authentication required)
 */
router.get('/:id/verify', verifyCertificateHandler);

/**
 * @route   GET /api/certificates/:id/download
 * @desc    Download certificate
 * @access  Private (certificate owner only)
 */
router.get('/:id/download', authenticateJWT, downloadCertificateHandler);

export default router;
