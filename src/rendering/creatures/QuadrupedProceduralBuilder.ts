import * as THREE from 'three';
import { IProceduralCreatureBuilder } from './IProceduralBuilder';
import { AnimationTrackBuilder } from './AnimationTrackBuilder';

export class QuadrupedProceduralBuilder implements IProceduralCreatureBuilder {
  private clipsCache: Map<string, THREE.AnimationClip> | null = null;

  // Кэшированные материалы собаки для исключения утечек памяти
  private static furMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.6 });
  private static chestFurMat = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.6 });
  private static collarMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
  private static noseMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.9 });
  private static eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });

  // Материалы для худой гончей (доберман / овчарка)
  private static houndFurMat = new THREE.MeshStandardMaterial({ color: 0x272422, roughness: 0.5 });
  private static houndTanMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
  private static houndCollarMat = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    roughness: 0.4,
  });

  public createRigTemplate(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'DogRoot';

    const torso = new THREE.Group();
    torso.name = 'Torso';
    torso.position.set(0, 0.48, 0);
    root.add(torso);

    const headPivot = new THREE.Group();
    headPivot.name = 'HeadPivot';
    headPivot.position.set(0, 0.18, 0.3);

    const jawsSocket = new THREE.Group();
    jawsSocket.name = 'JawsSocket';
    jawsSocket.position.set(0, -0.02, 0.38);
    headPivot.add(jawsSocket);

    torso.add(headPivot);

    const tailPivot = new THREE.Group();
    tailPivot.name = 'TailPivot';
    tailPivot.position.set(0, 0.08, -0.36);
    torso.add(tailPivot);

    const frontLeftLegPivot = new THREE.Group();
    frontLeftLegPivot.name = 'FrontLeftLegPivot';
    frontLeftLegPivot.position.set(0.16, 0.4, 0.22);
    root.add(frontLeftLegPivot);

    const frontRightLegPivot = new THREE.Group();
    frontRightLegPivot.name = 'FrontRightLegPivot';
    frontRightLegPivot.position.set(-0.16, 0.4, 0.22);
    root.add(frontRightLegPivot);

    const backLeftLegPivot = new THREE.Group();
    backLeftLegPivot.name = 'BackLeftLegPivot';
    backLeftLegPivot.position.set(0.16, 0.4, -0.22);
    root.add(backLeftLegPivot);

    const backRightLegPivot = new THREE.Group();
    backRightLegPivot.name = 'BackRightLegPivot';
    backRightLegPivot.position.set(-0.16, 0.4, -0.22);
    root.add(backRightLegPivot);

    return root;
  }

  public createPartMesh(partKey: string): THREE.Object3D | null {
    const {
      furMat,
      chestFurMat,
      collarMat,
      noseMat,
      eyeMat,
      houndFurMat,
      houndTanMat,
      houndCollarMat,
    } = QuadrupedProceduralBuilder;
    const isHound = partKey.endsWith('_hound');

    const fMat = isHound ? houndFurMat : furMat;
    const cMat = isHound ? houndTanMat : chestFurMat;
    const colMat = isHound ? houndCollarMat : collarMat;

    switch (partKey) {
      case 'torso':
      case 'torso_hound': {
        const torsoMesh = new THREE.Group();
        torsoMesh.name = 'TorsoMesh';

        const chestWidth = isHound ? 0.3 : 0.38;
        const mane = new THREE.Mesh(new THREE.BoxGeometry(chestWidth, 0.36, 0.32), cMat);
        mane.position.set(0, 0.01, 0.12);
        mane.castShadow = true;
        torsoMesh.add(mane);

        const collar = new THREE.Mesh(
          new THREE.BoxGeometry(chestWidth + 0.01, 0.365, 0.05),
          colMat
        );
        collar.position.set(0, 0.01, 0.27);
        collar.castShadow = true;
        torsoMesh.add(collar);

        const hindWidth = isHound ? 0.24 : 0.32;
        const hindBody = new THREE.Mesh(new THREE.BoxGeometry(hindWidth, 0.28, 0.38), fMat);
        hindBody.position.set(0, -0.01, -0.18);
        hindBody.castShadow = true;
        torsoMesh.add(hindBody);

        return torsoMesh;
      }
      case 'head':
      case 'head_hound': {
        const headGroup = new THREE.Group();
        headGroup.name = 'Head';

        const headW = isHound ? 0.26 : 0.32;
        const headBox = new THREE.Mesh(new THREE.BoxGeometry(headW, 0.28, 0.28), fMat);
        headBox.position.set(0, 0.06, 0.1);
        headBox.castShadow = true;
        headGroup.add(headBox);

        const muzzle = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.13, 0.2),
          isHound ? houndTanMat : fMat
        );
        muzzle.position.set(0, 0.0, 0.28);
        muzzle.castShadow = true;
        headGroup.add(muzzle);

        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), noseMat);
        nose.position.set(0, 0.04, 0.385);
        nose.castShadow = true;
        headGroup.add(nose);

        const eyeX = isHound ? 0.09 : 0.11;
        const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eyeMat);
        leftEye.position.set(eyeX, 0.08, 0.24);
        headGroup.add(leftEye);

        const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eyeMat);
        rightEye.position.set(-eyeX, 0.08, 0.24);
        headGroup.add(rightEye);

        // Уши: у обычной собаки маленькие (0.1м), у гончей высокие вертикальные торчащие уши (0.24м)
        const earHeight = isHound ? 0.24 : 0.1;
        const earPosY = isHound ? 0.31 : 0.24;
        const earW = isHound ? 0.06 : 0.08;

        const leftEar = new THREE.Mesh(new THREE.BoxGeometry(earW, earHeight, 0.04), fMat);
        leftEar.position.set(0.1, earPosY, 0.08);
        if (isHound) leftEar.rotation.z = -0.15;
        leftEar.castShadow = true;
        headGroup.add(leftEar);

        const rightEar = new THREE.Mesh(new THREE.BoxGeometry(earW, earHeight, 0.04), fMat);
        rightEar.position.set(-0.1, earPosY, 0.08);
        if (isHound) rightEar.rotation.z = 0.15;
        rightEar.castShadow = true;
        headGroup.add(rightEar);

        return headGroup;
      }
      case 'tail':
      case 'tail_hound': {
        const tailThickness = isHound ? 0.06 : 0.08;
        const tailMesh = new THREE.Mesh(
          new THREE.BoxGeometry(tailThickness, tailThickness, 0.34),
          fMat
        );
        tailMesh.name = 'Tail';
        tailMesh.position.set(0, -0.02, -0.15);
        tailMesh.castShadow = true;
        return tailMesh;
      }
      case 'front_leg_l':
      case 'front_leg_l_hound':
      case 'front_leg_r':
      case 'front_leg_r_hound':
      case 'rear_leg_l':
      case 'rear_leg_l_hound':
      case 'rear_leg_r':
      case 'rear_leg_r_hound': {
        const legThickness = isHound ? 0.09 : 0.12;
        const legMesh = new THREE.Mesh(
          new THREE.BoxGeometry(legThickness, 0.4, legThickness),
          isHound ? houndTanMat : fMat
        );
        legMesh.position.set(0, -0.2, 0);
        legMesh.castShadow = true;
        return legMesh;
      }
      default:
        return null;
    }
  }

  public createAnimationClips(): Map<string, THREE.AnimationClip> {
    if (this.clipsCache) return this.clipsCache;

    const fps = 30;
    const duration = 0.6;
    const frames = fps * duration;
    const times: number[] = [];
    const torsoP: number[] = [];
    const torsoQ: number[] = [];
    const headQ: number[] = [];
    const tailQ: number[] = [];
    const fllP: number[] = [];
    const frlP: number[] = [];
    const bllP: number[] = [];
    const brlP: number[] = [];
    const idQ = [0, 0, 0, 1];
    const getQuat = AnimationTrackBuilder.eulerToQuat;

    for (let i = 0; i <= frames; i++) {
      const t = (i / frames) * duration;
      times.push(t);
      const cycle = (i / frames) * Math.PI * 2;

      const breatheY = Math.sin(cycle) * 0.008;
      torsoP.push(0, 0.48 + breatheY, 0);
      torsoQ.push(...idQ);
      headQ.push(...idQ);

      const tailWag = Math.sin(cycle * 2) * 0.24;
      tailQ.push(...getQuat(-0.7, tailWag, 0));

      fllP.push(0.16, 0.4, 0.22);
      frlP.push(-0.16, 0.4, 0.22);
      bllP.push(0.16, 0.4, -0.22);
      brlP.push(-0.16, 0.4, -0.22);
    }

    const legTrackTimes = [0.0, duration];
    const legTrackQ = [...idQ, ...idQ];

    // 1. Покой стоя (Stand Idle)
    const dogIdleClip = new AnimationTrackBuilder()
      .addPosTrack('Torso', times, torsoP)
      .addQuatTrack('Torso', times, torsoQ)
      .addPosTrack('HeadPivot', [0.0, duration], [0, 0.18, 0.3, 0, 0.18, 0.3])
      .addQuatTrack('HeadPivot', times, headQ)
      .addQuatTrack('TailPivot', times, tailQ)
      .addPosTrack('FrontLeftLegPivot', times, fllP)
      .addQuatTrack('FrontLeftLegPivot', legTrackTimes, legTrackQ)
      .addPosTrack('FrontRightLegPivot', times, frlP)
      .addQuatTrack('FrontRightLegPivot', legTrackTimes, legTrackQ)
      .addPosTrack('BackLeftLegPivot', times, bllP)
      .addQuatTrack('BackLeftLegPivot', legTrackTimes, legTrackQ)
      .addPosTrack('BackRightLegPivot', times, brlP)
      .addQuatTrack('BackRightLegPivot', legTrackTimes, legTrackQ)
      .build('stand_idle', duration);

    // --- Параметрический генератор локомоции собаки ---
    const createDogWalkCycleClip = (
      name: string,
      cycleDuration: number,
      swingAmount: number,
      bounceAmount: number,
      torsoXRot = 0,
      headPosY = 0.18,
      headPosZ = 0.3,
      torsoBaseY = 0.48,
      legBaseY = 0.4
    ) => {
      const cycleFrames = Math.max(2, Math.round(fps * cycleDuration));
      const cycleTimes: number[] = [];
      const cTorsoP: number[] = [];
      const cTorsoQ: number[] = [];
      const cHeadP: number[] = [];
      const cHeadQ: number[] = [];
      const cTailQ: number[] = [];
      const cFllP: number[] = [];
      const cFrlP: number[] = [];
      const cBllP: number[] = [];
      const cBrlP: number[] = [];
      const cPair1Q: number[] = [];
      const cPair2Q: number[] = [];

      for (let i = 0; i <= cycleFrames; i++) {
        const progress = i / cycleFrames;
        const time = progress * cycleDuration;
        cycleTimes.push(time);
        const cycle = progress * Math.PI * 2;

        const swing = Math.sin(cycle) * swingAmount;
        const bounce = bounceAmount > 0 ? Math.pow(Math.sin(cycle), 2) * bounceAmount : 0;

        cTorsoP.push(0, torsoBaseY + bounce, 0);
        cTorsoQ.push(...getQuat(torsoXRot, 0, 0));
        cHeadP.push(0, headPosY, headPosZ);
        cHeadQ.push(...getQuat(-torsoXRot, 0, 0));

        cTailQ.push(...getQuat(-0.75 + bounce * 1.5, Math.sin(cycle) * 0.18, 0));

        cFllP.push(0.16, legBaseY + bounce, 0.22);
        cFrlP.push(-0.16, legBaseY + bounce, 0.22);
        cBllP.push(0.16, legBaseY + bounce, -0.22);
        cBrlP.push(-0.16, legBaseY + bounce, -0.22);

        cPair1Q.push(...getQuat(swing, 0, 0));
        cPair2Q.push(...getQuat(-swing, 0, 0));
      }

      return new AnimationTrackBuilder()
        .addPosTrack('Torso', cycleTimes, cTorsoP)
        .addQuatTrack('Torso', cycleTimes, cTorsoQ)
        .addPosTrack('HeadPivot', cycleTimes, cHeadP)
        .addQuatTrack('HeadPivot', cycleTimes, cHeadQ)
        .addQuatTrack('TailPivot', cycleTimes, cTailQ)
        .addPosTrack('FrontLeftLegPivot', cycleTimes, cFllP)
        .addQuatTrack('FrontLeftLegPivot', cycleTimes, cPair1Q)
        .addPosTrack('BackRightLegPivot', cycleTimes, cBrlP)
        .addQuatTrack('BackRightLegPivot', cycleTimes, cPair1Q)
        .addPosTrack('FrontRightLegPivot', cycleTimes, cFrlP)
        .addQuatTrack('FrontRightLegPivot', cycleTimes, cPair2Q)
        .addPosTrack('BackLeftLegPivot', cycleTimes, cBllP)
        .addQuatTrack('BackLeftLegPivot', cycleTimes, cPair2Q)
        .build(name, cycleDuration);
    };

    // 2. Локомоция стоя
    const dogJoggingClip = createDogWalkCycleClip('stand_jog', 0.5, 0.7, 0.105, 0, 0.18, 0.3);
    const dogWalkClip = createDogWalkCycleClip('stand_walk', 0.8, 0.4, 0.03, 0, 0.18, 0.3);
    const dogSprintClip = createDogWalkCycleClip('stand_sprint', 0.35, 1.1, 0.036, 0, 0.11, 0.34);

    // 3. Локомоция в приседе / подкрадывание (Crouch - Stalking)
    const dogCrouchIdle = new AnimationTrackBuilder()
      .addPosTrack('Torso', [0.0, 2.0], [0, 0.32, 0, 0, 0.32, 0])
      .addQuatTrack('Torso', [0.0, 2.0], [...getQuat(0.12, 0, 0), ...getQuat(0.12, 0, 0)])
      .addPosTrack('HeadPivot', [0.0, 2.0], [0, 0.1, 0.34, 0, 0.1, 0.34])
      .addQuatTrack('HeadPivot', [0.0, 2.0], [...getQuat(-0.1, 0, 0), ...getQuat(-0.1, 0, 0)])
      .addQuatTrack('TailPivot', [0.0, 2.0], [...getQuat(-0.4, 0, 0), ...getQuat(-0.4, 0, 0)])
      .addPosTrack('FrontLeftLegPivot', [0.0, 2.0], [0.16, 0.26, 0.22, 0.16, 0.26, 0.22])
      .addQuatTrack('FrontLeftLegPivot', [0.0, 2.0], [...idQ, ...idQ])
      .addPosTrack('FrontRightLegPivot', [0.0, 2.0], [-0.16, 0.26, 0.22, -0.16, 0.26, 0.22])
      .addQuatTrack('FrontRightLegPivot', [0.0, 2.0], [...idQ, ...idQ])
      .addPosTrack('BackLeftLegPivot', [0.0, 2.0], [0.16, 0.26, -0.22, 0.16, 0.26, -0.22])
      .addQuatTrack('BackLeftLegPivot', [0.0, 2.0], [...idQ, ...idQ])
      .addPosTrack('BackRightLegPivot', [0.0, 2.0], [-0.16, 0.26, -0.22, -0.16, 0.26, -0.22])
      .addQuatTrack('BackRightLegPivot', [0.0, 2.0], [...idQ, ...idQ])
      .build('crouch_idle', 2.0);

    const dogCrouchWalk = createDogWalkCycleClip(
      'crouch_walk',
      0.8,
      0.35,
      0.015,
      0.12,
      0.1,
      0.34,
      0.32,
      0.26
    );
    const dogCrouchJog = createDogWalkCycleClip(
      'crouch_jog',
      0.5,
      0.6,
      0.03,
      0.12,
      0.1,
      0.34,
      0.32,
      0.26
    );
    const dogCrouchSprint = createDogWalkCycleClip(
      'crouch_sprint',
      0.35,
      0.9,
      0.03,
      0.15,
      0.08,
      0.35,
      0.32,
      0.26
    );

    // 4. Покой лежа (Prone Idle / Отдых)
    const proneDuration = 2.0;
    const proneFrames = fps * proneDuration;
    const pTimes: number[] = [];
    const pTorsoP: number[] = [];
    const pTorsoQ: number[] = [];
    const pHeadQ: number[] = [];
    const pTailQ: number[] = [];

    for (let i = 0; i <= proneFrames; i++) {
      const t = (i / proneFrames) * proneDuration;
      pTimes.push(t);
      const cycle = (i / proneFrames) * Math.PI * 2;
      const breathe = Math.sin(cycle) * 0.006;

      pTorsoP.push(0, 0.18 + breathe, 0);
      pTorsoQ.push(...getQuat(0.25 + Math.sin(cycle) * 0.01, 0, 0));
      pHeadQ.push(...getQuat(-0.25 + Math.sin(cycle) * 0.01, 0, 0));
      pTailQ.push(...getQuat(-0.2, 0, 0));
    }

    const dogProneIdle = new AnimationTrackBuilder()
      .addPosTrack('Torso', pTimes, pTorsoP)
      .addQuatTrack('Torso', pTimes, pTorsoQ)
      .addPosTrack('HeadPivot', [0.0, proneDuration], [0, 0.02, 0.38, 0, 0.02, 0.38])
      .addQuatTrack('HeadPivot', pTimes, pHeadQ)
      .addQuatTrack('TailPivot', pTimes, pTailQ)
      .addPosTrack('FrontLeftLegPivot', [0.0, proneDuration], [0.16, 0.14, 0.24, 0.16, 0.14, 0.24])
      .addQuatTrack(
        'FrontLeftLegPivot',
        [0.0, proneDuration],
        [...getQuat(1.4, 0, 0), ...getQuat(1.4, 0, 0)]
      )
      .addPosTrack(
        'FrontRightLegPivot',
        [0.0, proneDuration],
        [-0.16, 0.14, 0.24, -0.16, 0.14, 0.24]
      )
      .addQuatTrack(
        'FrontRightLegPivot',
        [0.0, proneDuration],
        [...getQuat(1.4, 0, 0), ...getQuat(1.4, 0, 0)]
      )
      .addPosTrack('BackLeftLegPivot', [0.0, proneDuration], [0.16, 0.14, -0.2, 0.16, 0.14, -0.2])
      .addQuatTrack(
        'BackLeftLegPivot',
        [0.0, proneDuration],
        [...getQuat(-1.4, 0, 0), ...getQuat(-1.4, 0, 0)]
      )
      .addPosTrack(
        'BackRightLegPivot',
        [0.0, proneDuration],
        [-0.16, 0.14, -0.2, -0.16, 0.14, -0.2]
      )
      .addQuatTrack(
        'BackRightLegPivot',
        [0.0, proneDuration],
        [...getQuat(-1.4, 0, 0), ...getQuat(-1.4, 0, 0)]
      )
      .build('prone_idle', proneDuration);

    // 5. Ползание по-пластунски (Prone Crawl)
    const crawlDuration = 1.0;
    const crawlFrames = fps * crawlDuration;
    const crTimes: number[] = [];
    const crTorsoP: number[] = [];
    const crTorsoQ: number[] = [];
    const crHeadQ: number[] = [];
    const crTailQ: number[] = [];
    const crFllP: number[] = [];
    const crFrlP: number[] = [];
    const crBllP: number[] = [];
    const crBrlP: number[] = [];
    const crFllQ: number[] = [];
    const crFrlQ: number[] = [];

    for (let i = 0; i <= crawlFrames; i++) {
      const t = (i / crawlFrames) * crawlDuration;
      crTimes.push(t);
      const cycle = (i / crawlFrames) * Math.PI * 2;
      const roll = Math.sin(cycle) * 0.05;

      crTorsoP.push(0, 0.2 + Math.abs(Math.sin(cycle)) * 0.015, 0);
      crTorsoQ.push(...getQuat(0.2, 0, roll));
      crHeadQ.push(...getQuat(-0.2, -roll * 0.5, 0));
      crTailQ.push(...getQuat(-0.3, Math.sin(cycle) * 0.15, 0));

      const reach = Math.sin(cycle) * 0.08;
      crFllP.push(0.16, 0.15, 0.24 + reach);
      crFrlP.push(-0.16, 0.15, 0.24 - reach);
      crBllP.push(0.16, 0.15, -0.2 - reach);
      crBrlP.push(-0.16, 0.15, -0.2 + reach);

      crFllQ.push(...getQuat(1.3 + reach * 1.5, 0, 0));
      crFrlQ.push(...getQuat(1.3 - reach * 1.5, 0, 0));
    }

    const dogProneCrawl = new AnimationTrackBuilder()
      .addPosTrack('Torso', crTimes, crTorsoP)
      .addQuatTrack('Torso', crTimes, crTorsoQ)
      .addPosTrack('HeadPivot', [0.0, crawlDuration], [0, 0.02, 0.38, 0, 0.02, 0.38])
      .addQuatTrack('HeadPivot', crTimes, crHeadQ)
      .addQuatTrack('TailPivot', crTimes, crTailQ)
      .addPosTrack('FrontLeftLegPivot', crTimes, crFllP)
      .addQuatTrack('FrontLeftLegPivot', crTimes, crFllQ)
      .addPosTrack('FrontRightLegPivot', crTimes, crFrlP)
      .addQuatTrack('FrontRightLegPivot', crTimes, crFrlQ)
      .addPosTrack('BackLeftLegPivot', crTimes, crBllP)
      .addQuatTrack(
        'BackLeftLegPivot',
        [0.0, crawlDuration],
        [...getQuat(-1.4, 0, 0), ...getQuat(-1.4, 0, 0)]
      )
      .addPosTrack('BackRightLegPivot', crTimes, crBrlP)
      .addQuatTrack(
        'BackRightLegPivot',
        [0.0, crawlDuration],
        [...getQuat(-1.4, 0, 0), ...getQuat(-1.4, 0, 0)]
      )
      .build('prone_crawl', crawlDuration);

    // 6. Переходы: Стоя -> Лежа и Лежа -> Стоя
    const transTimes = [0.0, 0.35, 0.7];
    const dogStandToProne = new AnimationTrackBuilder()
      .addPosTrack('Torso', transTimes, [0, 0.48, 0, 0, 0.32, 0, 0, 0.18, 0])
      .addQuatTrack('Torso', transTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.12, 0, 0),
        ...getQuat(0.25, 0, 0),
      ])
      .addPosTrack('HeadPivot', transTimes, [0, 0.18, 0.3, 0, 0.1, 0.34, 0, 0.02, 0.38])
      .addQuatTrack('HeadPivot', transTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(-0.1, 0, 0),
        ...getQuat(-0.25, 0, 0),
      ])
      .addPosTrack(
        'FrontLeftLegPivot',
        transTimes,
        [0.16, 0.4, 0.22, 0.16, 0.26, 0.22, 0.16, 0.14, 0.24]
      )
      .addQuatTrack('FrontLeftLegPivot', transTimes, [
        ...idQ,
        ...getQuat(0.6, 0, 0),
        ...getQuat(1.4, 0, 0),
      ])
      .addPosTrack(
        'FrontRightLegPivot',
        transTimes,
        [-0.16, 0.4, 0.22, -0.16, 0.26, 0.22, -0.16, 0.14, 0.24]
      )
      .addQuatTrack('FrontRightLegPivot', transTimes, [
        ...idQ,
        ...getQuat(0.6, 0, 0),
        ...getQuat(1.4, 0, 0),
      ])
      .addPosTrack(
        'BackLeftLegPivot',
        transTimes,
        [0.16, 0.4, -0.22, 0.16, 0.26, -0.22, 0.16, 0.14, -0.2]
      )
      .addQuatTrack('BackLeftLegPivot', transTimes, [
        ...idQ,
        ...getQuat(-0.6, 0, 0),
        ...getQuat(-1.4, 0, 0),
      ])
      .addPosTrack(
        'BackRightLegPivot',
        transTimes,
        [-0.16, 0.4, -0.22, -0.16, 0.26, -0.22, -0.16, 0.14, -0.2]
      )
      .addQuatTrack('BackRightLegPivot', transTimes, [
        ...idQ,
        ...getQuat(-0.6, 0, 0),
        ...getQuat(-1.4, 0, 0),
      ])
      .build('stand_to_prone', 0.7);

    const dogProneToStand = new AnimationTrackBuilder()
      .addPosTrack('Torso', transTimes, [0, 0.18, 0, 0, 0.32, 0, 0, 0.48, 0])
      .addQuatTrack('Torso', transTimes, [
        ...getQuat(0.25, 0, 0),
        ...getQuat(0.12, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack('HeadPivot', transTimes, [0, 0.02, 0.38, 0, 0.1, 0.34, 0, 0.18, 0.3])
      .addQuatTrack('HeadPivot', transTimes, [
        ...getQuat(-0.25, 0, 0),
        ...getQuat(-0.1, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack(
        'FrontLeftLegPivot',
        transTimes,
        [0.16, 0.14, 0.24, 0.16, 0.26, 0.22, 0.16, 0.4, 0.22]
      )
      .addQuatTrack('FrontLeftLegPivot', transTimes, [
        ...getQuat(1.4, 0, 0),
        ...getQuat(0.6, 0, 0),
        ...idQ,
      ])
      .addPosTrack(
        'FrontRightLegPivot',
        transTimes,
        [-0.16, 0.14, 0.24, -0.16, 0.26, 0.22, -0.16, 0.4, 0.22]
      )
      .addQuatTrack('FrontRightLegPivot', transTimes, [
        ...getQuat(1.4, 0, 0),
        ...getQuat(0.6, 0, 0),
        ...idQ,
      ])
      .addPosTrack(
        'BackLeftLegPivot',
        transTimes,
        [0.16, 0.14, -0.2, 0.16, 0.26, -0.22, 0.16, 0.4, -0.22]
      )
      .addQuatTrack('BackLeftLegPivot', transTimes, [
        ...getQuat(-1.4, 0, 0),
        ...getQuat(-0.6, 0, 0),
        ...idQ,
      ])
      .addPosTrack(
        'BackRightLegPivot',
        transTimes,
        [-0.16, 0.14, -0.2, -0.16, 0.26, -0.22, -0.16, 0.4, -0.22]
      )
      .addQuatTrack('BackRightLegPivot', transTimes, [
        ...getQuat(-1.4, 0, 0),
        ...getQuat(-0.6, 0, 0),
        ...idQ,
      ])
      .build('prone_to_stand', 0.7);

    // ==========================================
    // 7. АНИМАЦИИ ПЛАВАНИЯ СОБАКИ (SWIMMING)
    // ==========================================

    // 7.1. Удержание на воде на месте (Dog Treading water)
    const swimDogIdleDuration = 1.6;
    const swimDogIdleFrames = fps * swimDogIdleDuration;
    const sdiTimes: number[] = [];
    const sdiTorsoP: number[] = [];
    const sdiTorsoQ: number[] = [];
    const sdiHeadQ: number[] = [];
    const sdiTailQ: number[] = [];
    const sdiFllP: number[] = [];
    const sdiFrlP: number[] = [];
    const sdiBllP: number[] = [];
    const sdiBrlP: number[] = [];
    const sdiFllQ: number[] = [];
    const sdiFrlQ: number[] = [];

    for (let i = 0; i <= swimDogIdleFrames; i++) {
      const t = (i / swimDogIdleFrames) * swimDogIdleDuration;
      sdiTimes.push(t);
      const cycle = (i / swimDogIdleFrames) * Math.PI * 2;
      const bob = Math.sin(cycle) * 0.025;

      // Грудная клетка приподнята над водой (наклон корпуса назад/вверх ~32 градуса)
      sdiTorsoP.push(0, 0.38 + bob, 0);
      sdiTorsoQ.push(...getQuat(-0.55, 0, 0));

      // Голова высоко задрана над водой
      sdiHeadQ.push(...getQuat(-0.5, 0, 0));
      sdiTailQ.push(...getQuat(-0.9 + Math.sin(cycle) * 0.1, 0, 0));

      // Ленивые вертикальные гребки лапами под себя
      const paddleL = Math.sin(cycle);
      const paddleR = -paddleL;

      sdiFllP.push(0.16, 0.32 + paddleL * 0.03, 0.22);
      sdiFrlP.push(-0.16, 0.32 + paddleR * 0.03, 0.22);
      sdiBllP.push(0.16, 0.28, -0.22);
      sdiBrlP.push(-0.16, 0.28, -0.22);

      sdiFllQ.push(...getQuat(0.4 + paddleL * 0.3, 0, 0));
      sdiFrlQ.push(...getQuat(0.4 + paddleR * 0.3, 0, 0));
    }

    const dogSwimIdle = new AnimationTrackBuilder()
      .addPosTrack('Torso', sdiTimes, sdiTorsoP)
      .addQuatTrack('Torso', sdiTimes, sdiTorsoQ)
      .addPosTrack('HeadPivot', [0.0, swimDogIdleDuration], [0, 0.24, 0.32, 0, 0.24, 0.32])
      .addQuatTrack('HeadPivot', sdiTimes, sdiHeadQ)
      .addQuatTrack('TailPivot', sdiTimes, sdiTailQ)
      .addPosTrack('FrontLeftLegPivot', sdiTimes, sdiFllP)
      .addQuatTrack('FrontLeftLegPivot', sdiTimes, sdiFllQ)
      .addPosTrack('FrontRightLegPivot', sdiTimes, sdiFrlP)
      .addQuatTrack('FrontRightLegPivot', sdiTimes, sdiFrlQ)
      .addPosTrack('BackLeftLegPivot', sdiTimes, sdiBllP)
      .addQuatTrack(
        'BackLeftLegPivot',
        [0.0, swimDogIdleDuration],
        [...getQuat(-0.5, 0, 0), ...getQuat(-0.5, 0, 0)]
      )
      .addPosTrack('BackRightLegPivot', sdiTimes, sdiBrlP)
      .addQuatTrack(
        'BackRightLegPivot',
        [0.0, swimDogIdleDuration],
        [...getQuat(-0.5, 0, 0), ...getQuat(-0.5, 0, 0)]
      )
      .build('swim_idle', swimDogIdleDuration);

    // 7.2. Параметрический собачий стиль (Dog Paddle: walk / jog / sprint)
    const createDogPaddleClip = (
      name: string,
      cycleDuration: number,
      torsoPitch: number,
      bounceAmp: number,
      paddleAmp: number
    ) => {
      const cycleFrames = Math.max(2, Math.round(fps * cycleDuration));
      const times: number[] = [];
      const torsoP: number[] = [];
      const torsoQ: number[] = [];
      const headP: number[] = [];
      const headQ: number[] = [];
      const tailQ: number[] = [];
      const fllP: number[] = [];
      const frlP: number[] = [];
      const bllP: number[] = [];
      const brlP: number[] = [];
      const fllQ: number[] = [];
      const frlQ: number[] = [];
      const bllQ: number[] = [];
      const brlQ: number[] = [];

      for (let i = 0; i <= cycleFrames; i++) {
        const progress = i / cycleFrames;
        const time = progress * cycleDuration;
        times.push(time);
        const cycle = progress * Math.PI * 2;
        const bounce = Math.sin(cycle) * bounceAmp;

        torsoP.push(0, 0.34 + bounce, 0);
        torsoQ.push(...getQuat(torsoPitch, 0, Math.sin(cycle) * 0.05));

        headP.push(0, 0.2, 0.35);
        headQ.push(...getQuat(-0.35, 0, 0));
        tailQ.push(...getQuat(-0.4, Math.sin(cycle * 2) * 0.25, 0));

        // Гребки передними лапами по круговой траектории под грудь
        const strokeL = Math.sin(cycle);
        const strokeR = Math.sin(cycle + Math.PI);
        const depthL = Math.cos(cycle);
        const depthR = Math.cos(cycle + Math.PI);

        fllP.push(0.16, 0.3 - depthL * 0.04, 0.22);
        frlP.push(-0.16, 0.3 - depthR * 0.04, 0.22);

        fllQ.push(...getQuat(-0.1 + strokeL * paddleAmp, 0, 0));
        frlQ.push(...getQuat(-0.1 + strokeR * paddleAmp, 0, 0));

        // Толчки задними лапами
        const kickL = Math.sin(cycle + Math.PI * 0.5);
        const kickR = Math.sin(cycle - Math.PI * 0.5);

        bllP.push(0.16, 0.28, -0.22);
        brlP.push(-0.16, 0.28, -0.22);

        bllQ.push(...getQuat(-0.3 + kickL * (paddleAmp * 0.7), 0, 0));
        brlQ.push(...getQuat(-0.3 + kickR * (paddleAmp * 0.7), 0, 0));
      }

      return new AnimationTrackBuilder()
        .addPosTrack('Torso', times, torsoP)
        .addQuatTrack('Torso', times, torsoQ)
        .addPosTrack('HeadPivot', times, headP)
        .addQuatTrack('HeadPivot', times, headQ)
        .addQuatTrack('TailPivot', times, tailQ)
        .addPosTrack('FrontLeftLegPivot', times, fllP)
        .addQuatTrack('FrontLeftLegPivot', times, fllQ)
        .addPosTrack('FrontRightLegPivot', times, frlP)
        .addQuatTrack('FrontRightLegPivot', times, frlQ)
        .addPosTrack('BackLeftLegPivot', times, bllP)
        .addQuatTrack('BackLeftLegPivot', times, bllQ)
        .addPosTrack('BackRightLegPivot', times, brlP)
        .addQuatTrack('BackRightLegPivot', times, brlQ)
        .build(name, cycleDuration);
    };

    const dogSwimWalk = createDogPaddleClip('swim_walk', 0.9, -0.32, 0.015, 0.45);
    const dogSwimJog = createDogPaddleClip('swim_jog', 0.65, -0.22, 0.025, 0.7);
    const dogSwimSprint = createDogPaddleClip('swim_sprint', 0.4, -0.12, 0.035, 1.0);

    // 8. Бросок пасти / Встряхивание для броска (Head-flick toss)
    const dogThrowTimes = [0.0, 0.12, 0.24, 0.45];
    const dogThrowClip = new AnimationTrackBuilder()
      .addPosTrack('Torso', dogThrowTimes, [0, 0.48, 0, 0, 0.44, -0.02, 0, 0.52, 0.04, 0, 0.48, 0])
      .addQuatTrack('Torso', dogThrowTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.06, 0, 0),
        ...getQuat(-0.1, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack(
        'HeadPivot',
        dogThrowTimes,
        [0, 0.18, 0.3, 0, 0.12, 0.34, 0, 0.24, 0.28, 0, 0.18, 0.3]
      )
      .addQuatTrack('HeadPivot', dogThrowTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.3, 0, 0), // Наклон вниз для замаха
        ...getQuat(-0.95, 0, 0), // Резкий мощный подброс головы вверх
        ...getQuat(0, 0, 0), // Возврат
      ])
      .addQuatTrack('TailPivot', dogThrowTimes, [
        ...getQuat(-0.7, 0, 0),
        ...getQuat(-0.4, 0.15, 0),
        ...getQuat(-0.8, -0.15, 0),
        ...getQuat(-0.7, 0, 0),
      ])
      .addPosTrack('FrontLeftLegPivot', [0.0, 0.45], [0.16, 0.4, 0.22, 0.16, 0.4, 0.22])
      .addQuatTrack('FrontLeftLegPivot', [0.0, 0.45], [...idQ, ...idQ])
      .addPosTrack('FrontRightLegPivot', [0.0, 0.45], [-0.16, 0.4, 0.22, -0.16, 0.4, 0.22])
      .addQuatTrack('FrontRightLegPivot', [0.0, 0.45], [...idQ, ...idQ])
      .addPosTrack('BackLeftLegPivot', [0.0, 0.45], [0.16, 0.4, -0.22, 0.16, 0.4, -0.22])
      .addQuatTrack('BackLeftLegPivot', [0.0, 0.45], [...idQ, ...idQ])
      .addPosTrack('BackRightLegPivot', [0.0, 0.45], [-0.16, 0.4, -0.22, -0.16, 0.4, -0.22])
      .addQuatTrack('BackRightLegPivot', [0.0, 0.45], [...idQ, ...idQ])
      .build('throw_item_jaws', 0.45);

    // 9. Атака пастью
    const attackTimes = [0.0, 0.1, 0.22, 0.35];
    const attackClip = new AnimationTrackBuilder()
      .addPosTrack('Torso', attackTimes, [0, 0.48, 0, 0, 0.46, -0.04, 0, 0.52, 0.08, 0, 0.48, 0])
      .addQuatTrack(
        'HeadPivot',
        attackTimes,
        [0, 0, 0, 1, -0.2, 0, 0, 0.98, 0.3, 0, 0, 0.95, 0, 0, 0, 1]
      )
      .build('attack', 0.35);

    // 10. Смерть собаки
    const deadTimes = [0.0, 0.3, 0.6];
    const deadClip = new AnimationTrackBuilder()
      .addPosTrack('Torso', deadTimes, [0, 0.48, 0, 0, 0.3, 0, 0, 0.15, 0])
      .addQuatTrack('Torso', deadTimes, [0, 0, 0, 1, 0, 0, -0.5, 0.86, 0, 0, -0.707, 0.707])
      .build('dead', 0.6);

    // 11. Подбор мяча/палки пастью
    const pickupTimes = [0.0, 0.18, 0.35, 0.48, 0.65];
    const dogPickupClip = new AnimationTrackBuilder()
      .addPosTrack(
        'Torso',
        pickupTimes,
        [0, 0.48, 0, 0, 0.44, 0.03, 0, 0.4, 0.05, 0, 0.45, 0.02, 0, 0.48, 0]
      )
      .addQuatTrack('Torso', pickupTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.12, 0, 0),
        ...getQuat(0.22, 0, 0),
        ...getQuat(0.1, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack(
        'HeadPivot',
        pickupTimes,
        [0, 0.18, 0.3, 0, 0.1, 0.34, 0, 0.02, 0.38, 0, 0.14, 0.33, 0, 0.18, 0.3]
      )
      .addQuatTrack('HeadPivot', pickupTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.35, 0, 0),
        ...getQuat(0.68, 0, 0),
        ...getQuat(0.22, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addQuatTrack('TailPivot', pickupTimes, [
        ...getQuat(-0.7, 0, 0),
        ...getQuat(-0.4, 0.18, 0),
        ...getQuat(-0.3, -0.18, 0),
        ...getQuat(-0.5, 0.12, 0),
        ...getQuat(-0.7, 0, 0),
      ])
      .addPosTrack(
        'FrontLeftLegPivot',
        pickupTimes,
        [0.16, 0.4, 0.22, 0.16, 0.38, 0.23, 0.16, 0.35, 0.25, 0.16, 0.38, 0.23, 0.16, 0.4, 0.22]
      )
      .addQuatTrack('FrontLeftLegPivot', pickupTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(-0.12, 0, 0),
        ...getQuat(-0.25, 0, 0),
        ...getQuat(-0.1, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack(
        'FrontRightLegPivot',
        pickupTimes,
        [
          -0.16, 0.4, 0.22, -0.16, 0.38, 0.23, -0.16, 0.35, 0.25, -0.16, 0.38, 0.23, -0.16, 0.4,
          0.22,
        ]
      )
      .addQuatTrack('FrontRightLegPivot', pickupTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(-0.12, 0, 0),
        ...getQuat(-0.25, 0, 0),
        ...getQuat(-0.1, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack(
        'BackLeftLegPivot',
        pickupTimes,
        [0.16, 0.4, -0.22, 0.16, 0.4, -0.22, 0.16, 0.4, -0.22, 0.16, 0.4, -0.22, 0.16, 0.4, -0.22]
      )
      .addQuatTrack('BackLeftLegPivot', pickupTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.08, 0, 0),
        ...getQuat(0.15, 0, 0),
        ...getQuat(0.06, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack(
        'BackRightLegPivot',
        pickupTimes,
        [
          -0.16, 0.4, -0.22, -0.16, 0.4, -0.22, -0.16, 0.4, -0.22, -0.16, 0.4, -0.22, -0.16, 0.4,
          -0.22,
        ]
      )
      .addQuatTrack('BackRightLegPivot', pickupTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.08, 0, 0),
        ...getQuat(0.15, 0, 0),
        ...getQuat(0.06, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .build('pickup_jaws', 0.65);

    // 12. Сброс мяча/палки пастью
    const dropTimes = [0.0, 0.12, 0.24, 0.38];
    const dogDropClip = new AnimationTrackBuilder()
      .addPosTrack('Torso', dropTimes, [0, 0.48, 0, 0, 0.46, 0.02, 0, 0.44, 0.03, 0, 0.48, 0])
      .addQuatTrack('Torso', dropTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.08, 0, 0),
        ...getQuat(0.14, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addPosTrack(
        'HeadPivot',
        dropTimes,
        [0, 0.18, 0.3, 0, 0.11, 0.33, 0, 0.06, 0.36, 0, 0.18, 0.3]
      )
      .addQuatTrack('HeadPivot', dropTimes, [
        ...getQuat(0, 0, 0),
        ...getQuat(0.28, 0, 0),
        ...getQuat(0.52, 0, 0),
        ...getQuat(0, 0, 0),
      ])
      .addQuatTrack('TailPivot', dropTimes, [
        ...getQuat(-0.7, 0, 0),
        ...getQuat(-0.55, 0.1, 0),
        ...getQuat(-0.5, -0.1, 0),
        ...getQuat(-0.7, 0, 0),
      ])
      .addPosTrack('FrontLeftLegPivot', [0.0, 0.38], [0.16, 0.4, 0.22, 0.16, 0.4, 0.22])
      .addQuatTrack('FrontLeftLegPivot', [0.0, 0.38], [...idQ, ...idQ])
      .addPosTrack('FrontRightLegPivot', [0.0, 0.38], [-0.16, 0.4, 0.22, -0.16, 0.4, 0.22])
      .addQuatTrack('FrontRightLegPivot', [0.0, 0.38], [...idQ, ...idQ])
      .addPosTrack('BackLeftLegPivot', [0.0, 0.38], [0.16, 0.4, -0.22, 0.16, 0.4, -0.22])
      .addQuatTrack('BackLeftLegPivot', [0.0, 0.38], [...idQ, ...idQ])
      .addPosTrack('BackRightLegPivot', [0.0, 0.38], [-0.16, 0.4, -0.22, -0.16, 0.4, -0.22])
      .addQuatTrack('BackRightLegPivot', [0.0, 0.38], [...idQ, ...idQ])
      .build('drop_item_jaws', 0.38);

    // 13. Прыжок и свободный полет собаки (Airborne)
    const durationDogAirborne = 0.8;
    const dogAirFrames = fps * durationDogAirborne;
    const dogAirTimes: number[] = [];
    const dogAirTorsoP: number[] = [];
    const dogAirTorsoQ: number[] = [];
    const dogAirTailQ: number[] = [];
    const dogAirFllP: number[] = [];
    const dogAirFrlP: number[] = [];
    const dogAirBllP: number[] = [];
    const dogAirBrlP: number[] = [];
    const dogAirFllQ: number[] = [];
    const dogAirFrlQ: number[] = [];
    const dogAirBllQ: number[] = [];
    const dogAirBrlQ: number[] = [];

    for (let i = 0; i <= dogAirFrames; i++) {
      const t = (i / dogAirFrames) * durationDogAirborne;
      dogAirTimes.push(t);
      const cycle = (i / dogAirFrames) * Math.PI * 2;
      const floatY = Math.sin(cycle) * 0.01;

      dogAirTorsoP.push(0, 0.48 + floatY, 0);
      dogAirTorsoQ.push(...idQ);
      dogAirTailQ.push(...getQuat(-0.5 + Math.sin(cycle) * 0.1, 0, 0));

      dogAirFllP.push(0.16, 0.4, 0.22);
      dogAirFrlP.push(-0.16, 0.4, 0.22);
      dogAirBllP.push(0.16, 0.4, -0.22);
      dogAirBrlP.push(-0.16, 0.4, -0.22);

      const drift = Math.sin(cycle) * 0.05;
      dogAirFllQ.push(...getQuat(drift, 0, 0.1));
      dogAirFrlQ.push(...getQuat(-drift, 0, -0.1));
      dogAirBllQ.push(...getQuat(-drift, 0, 0.1));
      dogAirBrlQ.push(...getQuat(drift, 0, -0.1));
    }

    const dogAirborneClip = new AnimationTrackBuilder()
      .addPosTrack('Torso', dogAirTimes, dogAirTorsoP)
      .addQuatTrack('Torso', dogAirTimes, dogAirTorsoQ)
      .addPosTrack('HeadPivot', [0.0, durationDogAirborne], [0, 0.18, 0.3, 0, 0.18, 0.3])
      .addQuatTrack('HeadPivot', [0.0, durationDogAirborne], [...idQ, ...idQ])
      .addQuatTrack('TailPivot', dogAirTimes, dogAirTailQ)
      .addPosTrack('FrontLeftLegPivot', dogAirTimes, dogAirFllP)
      .addQuatTrack('FrontLeftLegPivot', dogAirTimes, dogAirFllQ)
      .addPosTrack('FrontRightLegPivot', dogAirTimes, dogAirFrlP)
      .addQuatTrack('FrontRightLegPivot', dogAirTimes, dogAirFrlQ)
      .addPosTrack('BackLeftLegPivot', dogAirTimes, dogAirBllP)
      .addQuatTrack('BackLeftLegPivot', dogAirTimes, dogAirBllQ)
      .addPosTrack('BackRightLegPivot', dogAirTimes, dogAirBrlP)
      .addQuatTrack('BackRightLegPivot', dogAirTimes, dogAirBrlQ)
      .build('airborne', durationDogAirborne);

    const map = new Map<string, THREE.AnimationClip>();
    map.set('stand_idle', dogIdleClip);
    map.set('stand_walk', dogWalkClip);
    map.set('stand_jog', dogJoggingClip);
    map.set('stand_sprint', dogSprintClip);
    map.set('crouch_idle', dogCrouchIdle);
    map.set('crouch_walk', dogCrouchWalk);
    map.set('crouch_jog', dogCrouchJog);
    map.set('crouch_sprint', dogCrouchSprint);
    map.set('prone_idle', dogProneIdle);
    map.set('prone_crawl', dogProneCrawl);
    map.set('stand_to_prone', dogStandToProne);
    map.set('prone_to_stand', dogProneToStand);

    // Анимации плавания собаки
    map.set('swim_idle', dogSwimIdle);
    map.set('swim_walk', dogSwimWalk);
    map.set('swim_jog', dogSwimJog);
    map.set('swim_sprint', dogSwimSprint);

    map.set('attack', attackClip);
    map.set('pickup', dogPickupClip);
    map.set('pickup_jaws', dogPickupClip);
    map.set('drop_item', dogDropClip);
    map.set('drop_item_jaws', dogDropClip);
    map.set('throw', dogThrowClip);
    map.set('throw_item', dogThrowClip);
    map.set('throw_item_jaws', dogThrowClip);
    map.set('dead', deadClip);
    map.set('airborne', dogAirborneClip);

    this.clipsCache = map;
    return map;
  }
}
