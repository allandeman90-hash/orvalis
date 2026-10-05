import { mat4, type Mat4, vec3 } from '../math';

/**
 * Attachment points of a model (spec §70): explicit, numbered sockets carried by a bone, to which another
 * model (a held item, a shoulder piece…) is fastened as a child:
 *     item model → attachment id → bone / attachment transform → child model.
 *
 * FROM THE SPEC: models contain explicit attachment definitions, addressed by a numeric id; the attached model
 * follows the bone.
 * OUR CHOICES: the record (id, name, bone, position); the ids are OUR OWN stable numbers (the document warns
 * against giving meanings to the original ones); a socket has the orientation of its bone and no rotation of
 * its own; the child's origin is put on the socket.
 */
export interface Attachment {
  readonly id: number;
  readonly name: string;
  /** Bone that carries the socket. */
  readonly bone: number;
  /** Where the socket is, in model space, at rest. */
  readonly position: readonly [number, number, number];
}

export function validateAttachments(attachments: readonly Attachment[], boneCount: number): void {
  const seen = new Set<number>();
  attachments.forEach((a, index) => {
    if (!Number.isInteger(a.id) || a.id < 0) throw new Error(`attachment ${index} ("${a.name}") needs a whole id ≥ 0 (got ${a.id})`);
    if (seen.has(a.id)) throw new Error(`attachment id ${a.id} is used twice`);
    seen.add(a.id);
    if (!Number.isInteger(a.bone) || a.bone < 0 || a.bone >= boneCount) throw new Error(`attachment ${a.id} ("${a.name}") is on bone ${a.bone} but the model has ${boneCount} bone(s)`);
    if (a.position.length !== 3 || !a.position.every(Number.isFinite)) throw new Error(`attachment ${a.id} ("${a.name}") needs a finite position`);
  });
}

export function findAttachment(attachments: readonly Attachment[], id: number): Attachment {
  const found = attachments.find((a) => a.id === id);
  if (!found) throw new Error(`no attachment with id ${id}`);
  return found;
}

const scratch = mat4.create(), offset = vec3.create();

/**
 * Socket → model space for the current pose: boneMatrix × T(position). Multiply by the parent instance's
 * matrix on the left to get the child's model → world matrix.
 * @param palette the parent's bone matrices (computeBoneMatrices)
 */
export function attachmentMatrix(out: Mat4, attachment: Attachment, palette: Float32Array): Mat4 {
  const at = attachment.bone * 16;
  if (at + 16 > palette.length) throw new Error(`attachment ${attachment.id}: bone ${attachment.bone} is outside the palette`);
  mat4.fromTranslation(scratch, vec3.set(offset, attachment.position[0], attachment.position[1], attachment.position[2]));
  return mat4.multiply(out, palette.subarray(at, at + 16), scratch);
}
