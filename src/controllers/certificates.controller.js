import {
  getUserCertificates,
  getCertificateById,
  verifyCertificate
} from '../services/certificate.service.js';

/**
 * Get all certificates for the authenticated user
 * GET /api/certificates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} { certificates }
 */
export async function getUserCertificatesHandler(req, res) {
  try {
    const userId = req.user.userId;
    
    const certificates = await getUserCertificates(userId);
    
    return res.status(200).json({
      certificates: certificates.map(cert => ({
        id: cert.id,
        userId: cert.user_id,
        courseId: cert.course_id,
        serialNumber: cert.serial_number,
        issuedAt: cert.issued_at,
        certificateUrl: cert.certificate_url,
        course: {
          title: cert.course_title,
          description: cert.course_description,
          difficulty: cert.course_difficulty
        }
      }))
    });
  } catch (error) {
    console.error('Get user certificates error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve certificates'
    });
  }
}

/**
 * Get certificate details by ID
 * GET /api/certificates/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} { certificate }
 */
export async function getCertificateDetailsHandler(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const certificate = await getCertificateById(id);
    
    // Check if user owns this certificate
    if (certificate.user_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view this certificate'
      });
    }
    
    return res.status(200).json({
      certificate: {
        id: certificate.id,
        userId: certificate.user_id,
        courseId: certificate.course_id,
        serialNumber: certificate.serial_number,
        issuedAt: certificate.issued_at,
        certificateUrl: certificate.certificate_url,
        user: {
          name: certificate.user_name,
          email: certificate.user_email
        },
        course: {
          title: certificate.course_title,
          description: certificate.course_description,
          difficulty: certificate.course_difficulty,
          durationHours: certificate.course_duration
        }
      }
    });
  } catch (error) {
    if (error.message === 'Certificate not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Certificate not found'
      });
    }
    
    console.error('Get certificate details error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve certificate details'
    });
  }
}

/**
 * Verify certificate by serial number (public endpoint)
 * GET /api/certificates/:id/verify
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} { valid, certificate }
 */
export async function verifyCertificateHandler(req, res) {
  try {
    const { id } = req.params;
    
    // The id parameter is actually the serial number for verification
    const result = await verifyCertificate(id);
    
    if (!result.valid) {
      return res.status(404).json({
        valid: false,
        error: result.error
      });
    }
    
    return res.status(200).json({
      valid: true,
      certificate: {
        id: result.certificate.id,
        serialNumber: result.certificate.serial_number,
        issuedAt: result.certificate.issued_at,
        userName: result.certificate.user_name,
        courseTitle: result.certificate.course_title,
        courseDifficulty: result.certificate.course_difficulty,
        courseDuration: result.certificate.course_duration
      }
    });
  } catch (error) {
    console.error('Verify certificate error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify certificate'
    });
  }
}

/**
 * Download certificate (returns JSON for now, PDF generation can be added later)
 * GET /api/certificates/:id/download
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} { certificate, downloadUrl }
 */
export async function downloadCertificateHandler(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const certificate = await getCertificateById(id);
    
    // Check if user owns this certificate
    if (certificate.user_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to download this certificate'
      });
    }
    
    // For now, return JSON response with certificate data
    // PDF generation can be added later
    return res.status(200).json({
      certificate: {
        id: certificate.id,
        serialNumber: certificate.serial_number,
        issuedAt: certificate.issued_at,
        userName: certificate.user_name,
        courseTitle: certificate.course_title,
        courseDifficulty: certificate.course_difficulty,
        courseDuration: certificate.course_duration
      },
      message: 'Certificate data retrieved. PDF generation will be implemented in a future update.',
      downloadUrl: certificate.certificate_url || null
    });
  } catch (error) {
    if (error.message === 'Certificate not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Certificate not found'
      });
    }
    
    console.error('Download certificate error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to download certificate'
    });
  }
}
