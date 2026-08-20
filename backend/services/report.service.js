import { randomUUID } from 'crypto';
import Report from '../models/Report.js';
import Category from '../models/Category.js';
import Material from '../models/Material.js';
import { AppError } from './auth.service.js';
import { matchService } from './match.service.js';
import { blockchainService } from './blockchain.service.js';

const OWNER_ONLY_STATES = ['ACTIVE', 'MATCHED', 'IN_VERIFICATION'];

export const reportService = {
  async create(userId, data) {
    const { category_id, material_id, type, title, description, location, incident_date } = data;
    if (!category_id || !material_id || !type || !title || !incident_date) {
      throw new AppError(400, 'VALIDATION_ERROR', 'category_id, material_id, type, title, incident_date are required');
    }
    if (!['LOST', 'FOUND'].includes(type)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'type must be LOST or FOUND');
    }

    const [category, material] = await Promise.all([
      Category.findOne({ _id: category_id, deleted_at: null }),
      Material.findOne({ _id: material_id, deleted_at: null })
    ]);
    if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    if (!material) throw new AppError(404, 'MATERIAL_NOT_FOUND', 'Material not found');

    const report = await Report.create({
      user_id: userId, category_id, material_id, type, title, description,
      location, incident_date, token: randomUUID()
    });

    // Best-effort: matching failures should never break report creation
    matchService.generateForReport(report).catch((err) => {
      console.error('Match generation failed:', err.message);
    });

    // ------------------------------------------------------------------
    // Blockchain anchoring -- LOST reports only.
    //
    // We anchor only LOST reports because ownership is established at
    // the time of loss: the reporter is the claimant. FOUND reports have
    // no known owner at creation time, so anchoring them would create
    // orphaned on-chain entries. The FOUND side is implicitly covered
    // when a match is ACCEPTED (see match.service.js updateStatus).
    //
    // We hash the MongoDB ObjectId -- never the title, description,
    // location, or any other PII. The hash is a one-way SHA-256 digest
    // that links the on-chain record back to this database document
    // without exposing any personal data on the blockchain.
    //
    // The anchoring call waits for one block confirmation. If it fails
    // for any reason (node unreachable, revert, timeout, BLOCKCHAIN_ENABLED
    // not set), the error is caught here and the report is still returned
    // successfully. The blockchain fields remain null in that case.
    // ------------------------------------------------------------------
    if (type === 'LOST') {
      try {
        const deviceHash = blockchainService.hashEntityId(report._id.toString());
        const result = await blockchainService.registerDevice(deviceHash);
        if (result) {
          report.blockchain_device_id = result.deviceId.toString();
          report.blockchain_tx_hash   = result.txHash;
          await report.save();
        }
      } catch (err) {
        // Blockchain failure must never fail the report creation response
        console.error('[report.service] Blockchain anchoring failed for report', report._id, err.message);
      }
    }

    return report;
  },

  async list({ type, status, category_id, page = 1, limit = 20 }) {
    const filter = { deleted_at: null };
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (category_id) filter.category_id = category_id;
    else filter.status = filter.status || 'ACTIVE'; // default: only show active reports publicly

    const skip = (page - 1) * limit;
    const [reports, total] = await Promise.all([
      Report.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
      Report.countDocuments(filter)
    ]);
    return { reports, total, page: Number(page), limit: Number(limit) };
  },

  async getById(id) {
    const report = await Report.findOne({ _id: id, deleted_at: null });
    if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
    return report;
  },

  async update(id, userId, updates) {
    const report = await this.getById(id);
    if (report.user_id.toString() !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only edit your own reports');
    }
    const allowed = ['title', 'description', 'location', 'incident_date'];
    for (const key of allowed) {
      if (updates[key] !== undefined) report[key] = updates[key];
    }
    await report.save();
    return report;
  },

  async updateStatus(id, userId, status, actorRole) {
    const report = await this.getById(id);
    const isOwner = report.user_id.toString() === userId;
    const isPrivileged = ['admin', 'police'].includes(actorRole);
    if (!isOwner && !isPrivileged) {
      throw new AppError(403, 'FORBIDDEN', 'Not authorized to change this report status');
    }
    const valid = ['ACTIVE', 'MATCHED', 'IN_VERIFICATION', 'RECOVERED', 'CLOSED', 'CANCELLED'];
    if (!valid.includes(status)) {
      throw new AppError(400, 'VALIDATION_ERROR', `status must be one of: ${valid.join(', ')}`);
    }
    report.status = status;
    await report.save();
    return report;
  },

  async remove(id, userId) {
    const report = await this.getById(id);
    if (report.user_id.toString() !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only delete your own reports');
    }
    if (OWNER_ONLY_STATES.includes(report.status) === false && report.status !== 'CANCELLED') {
      // allow cancel/delete regardless of state for now; owner intent wins
    }
    report.deleted_at = new Date();
    await report.save();
    return { deleted: true };
  }
};