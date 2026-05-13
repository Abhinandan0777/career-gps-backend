import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Extract text content from PDF file buffer
 * 
 * @param {Buffer} fileBuffer - PDF file buffer
 * @returns {Promise<string>} Extracted text content
 */
export async function extractTextFromPDF(fileBuffer) {
  try {
    const data = await pdfParse(fileBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file');
  }
}

/**
 * Extract text content from DOCX file buffer
 * 
 * @param {Buffer} fileBuffer - DOCX file buffer
 * @returns {Promise<string>} Extracted text content
 */
export async function extractTextFromDOCX(fileBuffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Failed to parse DOCX file');
  }
}

/**
 * Extract text from resume file based on file type
 * 
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} mimetype - File MIME type
 * @returns {Promise<string>} Extracted text content
 */
export async function extractResumeText(fileBuffer, mimetype) {
  if (mimetype === 'application/pdf') {
    return await extractTextFromPDF(fileBuffer);
  } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return await extractTextFromDOCX(fileBuffer);
  } else {
    throw new Error('Unsupported file type. Only PDF and DOCX files are supported.');
  }
}
