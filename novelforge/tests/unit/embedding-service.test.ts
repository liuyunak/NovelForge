/**
 * Unit tests for EmbeddingService
 *
 * Tests: fallback embedding generation, cosine similarity, vector serialization
 */
import { describe, it, expect } from 'vitest'
import { EmbeddingService } from '../../src/memory/embedding-service.js'

describe('EmbeddingService', () => {
  const service = new EmbeddingService()

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const v = [1, 2, 3, 4, 5]
      const similarity = service.cosineSimilarity(v, v)
      expect(similarity).toBeCloseTo(1.0, 5)
    })

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0]
      const b = [0, 1, 0]
      const similarity = service.cosineSimilarity(a, b)
      expect(similarity).toBeCloseTo(0, 5)
    })

    it('should return -1 for opposite vectors', () => {
      const a = [1, 1, 1]
      const b = [-1, -1, -1]
      const similarity = service.cosineSimilarity(a, b)
      expect(similarity).toBeCloseTo(-1, 5)
    })

    it('should handle zero vectors', () => {
      const a = [0, 0, 0]
      const b = [1, 2, 3]
      const similarity = service.cosineSimilarity(a, b)
      expect(similarity).toBe(0)
    })

    it('should throw on dimension mismatch', () => {
      const a = [1, 2, 3]
      const b = [1, 2]
      expect(() => service.cosineSimilarity(a, b)).toThrow('dimension mismatch')
    })
  })

  describe('serializeVector / deserializeVector', () => {
    it('should round-trip a vector correctly', () => {
      const original = [0.1, 0.5, -0.3, 0.8, 0.0, 1.0]
      const buffer = service.serializeVector(original)
      const restored = service.deserializeVector(buffer)

      expect(restored.length).toBe(original.length)
      for (let i = 0; i < original.length; i++) {
        expect(restored[i]).toBeCloseTo(original[i], 4)
      }
    })

    it('should handle empty vector', () => {
      const buffer = service.serializeVector([])
      const restored = service.deserializeVector(buffer)
      expect(restored).toEqual([])
    })

    it('should produce buffer of correct size', () => {
      const vector = new Array(256).fill(0.5)
      const buffer = service.serializeVector(vector)
      // 256 * 4 bytes (float32)
      expect(buffer.length).toBe(1024)
    })
  })

  describe('fallback embedding', () => {
    it('should generate fallback embedding for any text', async () => {
      const result = await service.embed('测试文本')

      expect(result.vector).toBeDefined()
      expect(result.vector.length).toBe(256)
      expect(result.model).toBe('fallback-hash')
      expect(result.dimension).toBe(256)
    })

    it('should produce different embeddings for different texts', async () => {
      const r1 = await service.embed('主角修炼突破')
      const r2 = await service.embed('反派阴谋布局')

      const similarity = service.cosineSimilarity(r1.vector, r2.vector)
      // Different texts should have low similarity
      expect(similarity).toBeLessThan(0.9)
    })

    it('should produce similar embeddings for similar texts', async () => {
      const r1 = await service.embed('主角修炼突破境界')
      const r2 = await service.embed('主角修炼突破了')

      const similarity = service.cosineSimilarity(r1.vector, r2.vector)
      // Similar texts should have some similarity
      expect(similarity).toBeGreaterThan(0)
    })

    it('should cache results', async () => {
      const text = '缓存测试文本内容'
      const r1 = await service.embed(text)
      const r2 = await service.embed(text)

      // Same text should return identical vectors (from cache)
      expect(r1.vector).toEqual(r2.vector)
    })
  })

  describe('embedBatch', () => {
    it('should embed multiple texts', async () => {
      const texts = ['文本一', '文本二', '文本三']
      const results = await service.embedBatch(texts)

      expect(results.length).toBe(3)
      for (const r of results) {
        expect(r.vector.length).toBe(256)
      }
    })
  })
})
