import xml2js from 'xml2js'
import { query } from '../database/db'
import { DublinCoreMetadata, PremisMetadata, ArchiveFile } from '../types'
import crypto from 'crypto'

type FileWithMetadataRow = {
  id: string
  filename: string
  file_path: string
  file_hash: string
  mime_type: string
  file_size: number
  a11y_description: string | null
  cover_color: string | null
  meta_info: string | null
  rating: number | null
  created_at: string
  updated_at: string
  current_version: number
  access_level: ArchiveFile['accessLevel']
  title: string | null
  creator: string | null
  type: DublinCoreMetadata['dc:type'] | null
  language: string | null
  format: string | null
  preservation_level: PremisMetadata['premis:preservationLevel'] | null
  message_digest: string | null
  premis_json: PremisMetadata | null
}

const xmlBuilder = new xml2js.Builder({
  rootName: 'rdf:RDF'
})
// const xmlParser = new xml2js.Parser() // Not used

export class MetadataService {
  /**
   * Create Dublin Core metadata
   */
  static async createDublinCoreMetadata(
    fileId: string,
    metadata: Partial<DublinCoreMetadata>
  ): Promise<DublinCoreMetadata> {
    const defaultMetadata: DublinCoreMetadata = {
      'dc:identifier': fileId,
      'dc:title': metadata['dc:title'] || 'Untitled',
      'dc:creator': metadata['dc:creator'] || 'Unknown',
      'dc:subject': metadata['dc:subject'],
      'dc:description': metadata['dc:description'],
      'dc:publisher': metadata['dc:publisher'],
      'dc:date': new Date().toISOString(),
      'dc:type': metadata['dc:type'] || 'document',
      'dc:format': metadata['dc:format'] || 'application/octet-stream',
      'dc:language': metadata['dc:language'] || 'pl',
      'dc:rights': metadata['dc:rights'] || 'Copyright',
      'dc:source': metadata['dc:source']
    }

    const dcXml = this.buildDublinCoreXML(defaultMetadata)

    await query<Record<string, unknown>>(
      `INSERT INTO metadata_dublin_core (
        file_id, identifier, title, creator, subject, description,
        publisher, date_created, type, format, language, rights, source, dc_xml
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        fileId,
        fileId,
        defaultMetadata['dc:title'],
        defaultMetadata['dc:creator'],
        defaultMetadata['dc:subject'],
        defaultMetadata['dc:description'],
        defaultMetadata['dc:publisher'],
        defaultMetadata['dc:type'],
        defaultMetadata['dc:format'],
        defaultMetadata['dc:language'],
        defaultMetadata['dc:rights'],
        defaultMetadata['dc:source'],
        dcXml
      ]
    )

    return defaultMetadata
  }

  /**
   * Create PREMIS metadata
   */
  static async createPremisMetadata(
    fileId: string,
    fileHash: string,
    mimeType: string
  ): Promise<PremisMetadata> {
    const premisData: PremisMetadata = {
      'premis:objectIdentifier': fileId,
      'premis:objectCharacteristics': {
        'premis:compositionLevel': 0,
        'premis:fixity': {
          'premis:messageDigestAlgorithm': 'SHA-256',
          'premis:messageDigest': fileHash,
          'premis:messageDigestValidation': new Date().toISOString()
        },
        'premis:format': {
          'premis:formatRegistry': 'PRONOM',
          'premis:formatName': mimeType
        }
      },
      'premis:preservationLevel': 'fulPreservation',
      'premis:events': [
        {
          'premis:eventIdentifier': crypto.randomUUID(),
          'premis:eventType': 'creation',
          'premis:eventDateTime': new Date().toISOString(),
          'premis:eventDetail': 'File added to archive',
          'premis:linkingAgentIdentifier': 'system',
          'premis:linkingObjectIdentifier': fileId
        }
      ]
    }

    await query<{ premis_json: PremisMetadata }>(
      `INSERT INTO metadata_premis (
        file_id, object_identifier, format_name, message_digest,
        message_digest_algorithm, preservation_level, premis_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING premis_json`,
      [fileId, fileId, mimeType, fileHash, 'SHA-256', 'fulPreservation', JSON.stringify(premisData)]
    )

    return premisData
  }

  /**
   * Update Dublin Core metadata
   */
  static async updateDublinCoreMetadata(
    fileId: string,
    updates: Partial<DublinCoreMetadata>
  ): Promise<DublinCoreMetadata> {
    const result = await query<{ dc_xml: string }>(
      `SELECT dc_xml FROM metadata_dublin_core WHERE file_id = $1`,
      [fileId]
    )

    if (result.rows.length === 0) {
      throw new Error('Metadata not found')
    }

    const dcXml = this.buildDublinCoreXML(updates)

    await query(
      `UPDATE metadata_dublin_core SET
        title = COALESCE($1, title),
        creator = COALESCE($2, creator),
        subject = COALESCE($3, subject),
        description = COALESCE($4, description),
        publisher = COALESCE($5, publisher),
        type = COALESCE($6, type),
        language = COALESCE($7, language),
        rights = COALESCE($8, rights),
        dc_xml = $9,
        updated_at = NOW()
      WHERE file_id = $10`,
      [
        updates['dc:title'],
        updates['dc:creator'],
        updates['dc:subject'],
        updates['dc:description'],
        updates['dc:publisher'],
        updates['dc:type'],
        updates['dc:language'],
        updates['dc:rights'],
        dcXml,
        fileId
      ]
    )

    return updates as DublinCoreMetadata
  }

  /**
   * Record preservation event
   */
  static async recordPremisEvent(
    fileId: string,
    eventType: 'capture' | 'creation' | 'modification' | 'access' | 'migration' | 'validation',
    eventDetail: string,
    userId: string
  ): Promise<void> {
    const result = await query<{ premis_json: PremisMetadata }>(
      `SELECT premis_json FROM metadata_premis WHERE file_id = $1`,
      [fileId]
    )

    if (result.rows.length === 0) {
      throw new Error('PREMIS metadata not found')
    }

    const premisData = result.rows[0].premis_json as PremisMetadata

    const newEvent: PremisMetadata['premis:events'][number] = {
      'premis:eventIdentifier': crypto.randomUUID(),
      'premis:eventType': eventType,
      'premis:eventDateTime': new Date().toISOString(),
      'premis:eventDetail': eventDetail,
      'premis:linkingAgentIdentifier': userId,
      'premis:linkingObjectIdentifier': fileId
    }

    premisData['premis:events'].push(newEvent)

    await query(
      `UPDATE metadata_premis SET
        premis_json = $1,
        updated_at = NOW()
      WHERE file_id = $2`,
      [JSON.stringify(premisData), fileId]
    )
  }

  /**
   * Validate fixity (compare current hash with stored hash)
   */
  static async validateFixity(fileId: string, currentHash: string): Promise<boolean> {
    const result = await query<{ message_digest: string }>(
      `SELECT p.message_digest FROM metadata_premis p WHERE p.file_id = $1`,
      [fileId]
    )

    if (result.rows.length === 0) {
      throw new Error('PREMIS metadata not found')
    }

    const storedHash = result.rows[0].message_digest
    const isValid = storedHash === currentHash

    // Record validation event
    await this.recordPremisEvent(
      fileId,
      'validation',
      `Fixity check ${isValid ? 'passed' : 'FAILED'} - stored: ${storedHash}, current: ${currentHash}`,
      'system'
    )

    return isValid
  }

  /**
   * Get file with all metadata
   */
  static async getFileWithMetadata(fileId: string): Promise<ArchiveFile | null> {
    const result = await query<FileWithMetadataRow>(
      `SELECT
        f.id, f.filename, f.file_path, f.file_hash, f.mime_type, f.file_size,
        f.a11y_description, f.cover_color, f.meta_info, f.rating,
        f.created_at, f.updated_at, f.current_version, f.access_level,
        dc.title, dc.creator, dc.type, dc.language, dc.format,
        p.preservation_level, p.message_digest, p.premis_json
      FROM files f
      LEFT JOIN metadata_dublin_core dc ON f.id = dc.file_id
      LEFT JOIN metadata_premis p ON f.id = p.file_id
      WHERE f.id = $1`,
      [fileId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]

    return {
      id: row.id,
      filename: row.filename,
      filePath: row.file_path,
      fileHash: row.file_hash,
      mimeType: row.mime_type,
      fileSize: Number(row.file_size),
      originalCreatedAt: row.created_at,
      archiveAddedAt: row.created_at,
      updatedAt: row.updated_at,
      currentVersion: Number(row.current_version),
      dublinCore: {
        'dc:identifier': row.id,
        'dc:title': row.title || '',
        'dc:creator': row.creator || '',
        'dc:type': row.type || 'document',
        'dc:format': row.format || row.mime_type,
        'dc:language': row.language || 'pl'
      } as DublinCoreMetadata,
      premis: (row.premis_json ?? {
        'premis:objectIdentifier': row.id,
        'premis:objectCharacteristics': {
          'premis:compositionLevel': 0,
          'premis:fixity': {
            'premis:messageDigestAlgorithm': 'SHA-256',
            'premis:messageDigest': row.file_hash,
            'premis:messageDigestValidation': new Date().toISOString()
          },
          'premis:format': {
            'premis:formatRegistry': 'PRONOM',
            'premis:formatName': row.mime_type
          }
        },
        'premis:preservationLevel': row.preservation_level || 'fulPreservation',
        'premis:events': []
      }) as PremisMetadata,
      checksum: row.message_digest || row.file_hash,
      isAccessible: true,
      accessLevel: row.access_level
    }
  }

  // ========== PRIVATE METHODS ==========

  private static buildDublinCoreXML(metadata: Partial<DublinCoreMetadata>): string {
    const dc = {
      'rdf:RDF': {
        $: {
          'xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
          'xmlns:dc': 'http://purl.org/dc/elements/1.1/'
        },
        'rdf:Description': {
          $: {
            'rdf:about': metadata['dc:identifier']
          },
          'dc:identifier': metadata['dc:identifier'],
          'dc:title': metadata['dc:title'],
          'dc:creator': metadata['dc:creator'],
          'dc:subject': metadata['dc:subject'],
          'dc:description': metadata['dc:description'],
          'dc:publisher': metadata['dc:publisher'],
          'dc:date': metadata['dc:date'],
          'dc:type': metadata['dc:type'],
          'dc:format': metadata['dc:format'],
          'dc:language': metadata['dc:language'],
          'dc:rights': metadata['dc:rights'],
          'dc:source': metadata['dc:source']
        }
      }
    }

    return xmlBuilder.buildObject(dc)
  }
}

export default MetadataService
