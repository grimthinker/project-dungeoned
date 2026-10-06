import * as THREE from 'three';

export class ProceduralPropManager {
  private static instance: ProceduralPropManager;
  private cache = new Map<string, THREE.Group>();
  private cachedRockTexture: THREE.CanvasTexture | null = null;

  private constructor() {}

  public static getInstance(): ProceduralPropManager {
    if (!ProceduralPropManager.instance) {
      ProceduralPropManager.instance = new ProceduralPropManager();
    }
    return ProceduralPropManager.instance;
  }

  /**
   * Возвращает копию закэшированной модели.
   * Для статических мешей используется обычный clone(), который переиспользует Geometry и Material.
   */
  public getProp(name: string): THREE.Group | null {
    if (this.cache.has(name)) {
      return this.cache.get(name)!.clone();
    }

    let prop: THREE.Group | null = null;
    if (name === 'sword') {
      prop = this.buildSword();
    } else if (name === 'tree') {
      prop = this.buildTree();
    } else if (name === 'tree_2') {
      prop = this.buildTree2();
    } else if (name === 'tree_3') {
      prop = this.buildTree3();
    } else if (name === 'tree_spruce') {
      prop = this.buildSpruce();
    } else if (name === 'tree_pine') {
      prop = this.buildPine();
    } else if (name === 'well') {
      prop = this.buildWell();
    } else if (name === 'signpost') {
      prop = this.buildSignpost();
    } else if (name === 'signpost_single') {
      prop = this.buildSignpostSingle();
    } else if (name === 'log_pile_1') {
      prop = this.buildLogPile1();
    } else if (name === 'log_pile_2') {
      prop = this.buildLogPile2();
    } else if (name === 'stump') {
      prop = this.buildStump();
    } else if (name === 'toilet') {
      prop = this.buildToilet();
    } else if (name === 'barrel') {
      prop = this.buildBarrel();
    } else if (name === 'crate') {
      prop = this.buildCrateProp();
    } else if (name === 'bridge') {
      prop = this.buildBridge();
    } else if (name === 'lamp_post') {
      prop = this.buildLampPost();
    } else if (name === 'ball') {
      prop = this.buildBall();
    } else if (name === 'backpack') {
      prop = this.buildBackpack();
    } else if (name === 'house') {
      prop = this.buildHouse();
    } else if (name === 'fence') {
      prop = this.buildFence();
    } else if (name === 'rock_1') {
      prop = this.buildRock(1);
    } else if (name === 'rock_2') {
      prop = this.buildRock(2);
    } else if (name === 'rock_3') {
      prop = this.buildRock(3);
    } else if (name === 'rock_4') {
      prop = this.buildRock(4);
    } else if (name === 'rock_5') {
      prop = this.buildRock(5);
    }

    if (prop) {
      // Защищаем общую геометрию и материалы от случайного удаления
      prop.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.userData.isSharedAsset = true;
          child.userData.isSharedMaterial = true;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.cache.set(name, prop);
      return prop.clone();
    }

    return null;
  }

  private buildSword(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SwordRoot';

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x95a5a6,
      roughness: 0.3,
      metalness: 0.8,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.6,
      metalness: 0.5,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
      metalness: 0.0,
    });

    // Лезвие (Blade)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.02), metalMat);
    blade.position.set(0, 0.5, 0); // Смещено вверх от гарды
    group.add(blade);

    // Гарда (Crossguard)
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.04), darkMetalMat);
    guard.position.set(0, 0, 0); // Центр объекта на уровне гарды
    group.add(guard);

    // Рукоять (Grip)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.03), leatherMat);
    grip.position.set(0, -0.125, 0);
    group.add(grip);

    // Навершие (Pommel)
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), darkMetalMat);
    pommel.position.set(0, -0.25, 0);
    group.add(pommel);

    // Добавляем невидимый узел для хвата (GripPoint), чтобы предмет правильно ложился в руку
    const gripPoint = new THREE.Object3D();
    gripPoint.name = 'GripPoint';
    gripPoint.position.set(0, -0.1, 0); // Хват за рукоять чуть ниже гарды
    // Клинок (+Y) направлен вперед (+Z руки), а острая кромка (-X) смотрит вниз (-Y руки)
    gripPoint.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    group.add(gripPoint);

    return group;
  }

  private buildTree(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TreeRoot';

    const barkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.8,
      flatShading: true,
    });

    // Ствол (Trunk)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3.0, 6), barkMat);
    trunk.position.set(0, 1.5, 0);
    group.add(trunk);

    // Крона (Leaves)
    const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), leafMat);
    crown1.position.set(0, 3.5, 0);
    group.add(crown1);

    const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), leafMat);
    crown2.position.set(0.8, 3.0, -0.6);
    group.add(crown2);

    const crown3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), leafMat);
    crown3.position.set(-0.7, 2.8, 0.5);
    group.add(crown3);

    return group;
  }

  /** Лиственное дерево 2: раскидистое с мощным толстым стволом (дуб) */
  private buildTree2(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Tree2Root';

    const barkMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x33691e,
      roughness: 0.8,
      flatShading: true,
    });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.2, 7), barkMat);
    trunk.position.set(0, 1.6, 0);
    group.add(trunk);

    // Широкая приплюснутая раскидистая крона
    const cCenter = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), leafMat);
    cCenter.position.set(0, 3.8, 0);
    group.add(cCenter);

    const cEast = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), leafMat);
    cEast.position.set(1.2, 3.4, 0.3);
    group.add(cEast);

    const cWest = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), leafMat);
    cWest.position.set(-1.3, 3.3, -0.4);
    group.add(cWest);

    const cNorth = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), leafMat);
    cNorth.position.set(0.2, 3.5, 1.2);
    group.add(cNorth);

    const cSouth = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), leafMat);
    cSouth.position.set(-0.4, 3.4, -1.2);
    group.add(cSouth);

    return group;
  }

  /** Лиственное дерево 3: стройное высокое (береза / тополь) */
  private buildTree3(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Tree3Root';

    const barkMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x558b2f,
      roughness: 0.8,
      flatShading: true,
    });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 4.0, 6), barkMat);
    trunk.position.set(0, 2.0, 0);
    group.add(trunk);

    // Вертикально вытянутая крона
    const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), leafMat);
    c1.position.set(0, 3.4, 0);
    group.add(c1);

    const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), leafMat);
    c2.position.set(0.2, 4.3, -0.1);
    group.add(c2);

    const c3 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), leafMat);
    c3.position.set(-0.1, 5.0, 0.1);
    group.add(c3);

    return group;
  }

  /** Ель: пышная 8-гранная ель с расширенными ярусами и двухцветным стволом по референсу */
  private buildSpruce(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SpruceRoot';

    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x935128,
      roughness: 0.85,
      flatShading: true,
    });
    const barkShadowMat = new THREE.MeshStandardMaterial({
      color: 0x422213,
      roughness: 0.95,
      flatShading: true,
    });
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0x2e8540,
      roughness: 0.65,
      flatShading: true,
    });

    // 1. Двухцветный 8-гранный ствол
    const trunkLowerGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.55, 8).toNonIndexed();
    trunkLowerGeo.computeVertexNormals();
    const trunkLower = new THREE.Mesh(trunkLowerGeo, barkMat);
    trunkLower.position.set(0, 0.275, 0);
    trunkLower.rotation.y = Math.PI / 8;
    group.add(trunkLower);

    const trunkUpperGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.55, 8).toNonIndexed();
    trunkUpperGeo.computeVertexNormals();
    const trunkUpper = new THREE.Mesh(trunkUpperGeo, barkShadowMat);
    trunkUpper.position.set(0, 0.75, 0);
    trunkUpper.rotation.y = Math.PI / 8;
    group.add(trunkUpper);

    const createFacetedTier = (radius: number, height: number, bottomY: number) => {
      const geo = new THREE.ConeGeometry(radius, height, 8).toNonIndexed();
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, needleMat);
      mesh.position.set(0, bottomY + height / 2, 0);
      mesh.rotation.y = Math.PI / 8;
      return mesh;
    };

    // 2. Расширенные объемные ярусы хвои
    const tierBottom = createFacetedTier(2.1, 1.35, 0.75);
    group.add(tierBottom);

    const tierMid = createFacetedTier(1.65, 1.45, 1.55);
    group.add(tierMid);

    const tierTop = createFacetedTier(1.1, 1.95, 2.35);
    group.add(tierTop);

    return group;
  }

  /** Колодец: низкополигональный средневековый каменный колодец с деревянным воротом и синей крышей */
  private buildWell(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'WellRoot';

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x7e858f,
      roughness: 0.85,
      flatShading: true,
    });
    const stoneDarkMat = new THREE.MeshStandardMaterial({
      color: 0x5d636c,
      roughness: 0.9,
      flatShading: true,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x54331a,
      roughness: 0.85,
      flatShading: true,
    });
    const roofBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.55,
      flatShading: true,
    });
    const ropeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.9,
      flatShading: true,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.75,
      roughness: 0.35,
      flatShading: true,
    });
    const waterVoidMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      flatShading: true,
    });

    const segments = 8;

    // 1. Нижнее расширенное каменное кольцо основания
    const baseBottomGeo = new THREE.CylinderGeometry(1.0, 1.15, 0.22, segments).toNonIndexed();
    baseBottomGeo.computeVertexNormals();
    const baseBottom = new THREE.Mesh(baseBottomGeo, stoneDarkMat);
    baseBottom.position.set(0, 0.11, 0);
    group.add(baseBottom);

    // 2. Основной каменный восьмигранный цилиндр сруба
    const baseMidGeo = new THREE.CylinderGeometry(0.96, 1.0, 0.75, segments).toNonIndexed();
    baseMidGeo.computeVertexNormals();
    const baseMid = new THREE.Mesh(baseMidGeo, stoneMat);
    baseMid.position.set(0, 0.55, 0);
    group.add(baseMid);

    // 3. Верхний выступающий бортик колодца
    const baseTopGeo = new THREE.CylinderGeometry(1.08, 1.0, 0.2, segments).toNonIndexed();
    baseTopGeo.computeVertexNormals();
    const baseTop = new THREE.Mesh(baseTopGeo, stoneDarkMat);
    baseTop.position.set(0, 0.95, 0);
    group.add(baseTop);

    // Внутренняя водная гладь/пустота колодца
    const waterSurface = new THREE.Mesh(new THREE.CircleGeometry(0.85, segments), waterVoidMat);
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.set(0, 0.88, 0);
    group.add(waterSurface);

    // Боковые деревянные накладные доски на каменном срубе с металлическим ромбом
    [-1, 1].forEach((sign) => {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.06), woodMat);
      plank.position.set(0, 0.55, sign * 1.02);
      group.add(plank);

      const diamond = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.08), metalMat);
      diamond.rotation.z = Math.PI / 4;
      diamond.position.set(0, 0.6, sign * 1.03);
      group.add(diamond);
    });

    // Перекрывающие колодец доски
    const plank1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.26), woodMat);
    plank1.position.set(0.1, 1.06, 0.05);
    plank1.rotation.y = 0.25;
    group.add(plank1);

    const plank2 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.22), woodMat);
    plank2.position.set(-0.15, 1.07, -0.2);
    plank2.rotation.y = -0.3;
    group.add(plank2);

    // 4. Деревянные вертикальные стойки с Y-образными ветвями-распорками
    [-0.9, 0.9].forEach((px) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 0.18), woodMat);
      post.position.set(px, 1.65, 0);
      group.add(post);

      // Y-образные распорки под крышей
      const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.12), woodMat);
      strutL.position.set(px, 2.3, -0.16);
      strutL.rotation.x = -0.65;
      group.add(strutL);

      const strutR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.12), woodMat);
      strutR.position.set(px, 2.3, 0.16);
      strutR.rotation.x = 0.65;
      group.add(strutR);
    });

    // 5. Поперечный ворот с барабаном и намотанной веревкой
    const axle = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 0.08), metalMat);
    axle.position.set(0, 1.85, 0);
    group.add(axle);

    // Барабан с веревкой (золотисто-рыжий)
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.45, 8).toNonIndexed(),
      ropeMat
    );
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, 1.85, 0);
    group.add(drum);

    // Свисающий хвост веревки
    const hangingRope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), ropeMat);
    hangingRope.position.set(0.08, 1.5, 0.08);
    group.add(hangingRope);

    // Рукоять ворота (Stick / Crank)
    const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), metalMat);
    crankArm.position.set(-1.03, 1.75, 0);
    group.add(crankArm);

    const crankHandle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), woodMat);
    crankHandle.position.set(-1.12, 1.6, 0);
    group.add(crankHandle);

    // 6. Двускатная синяя крыша с деревянными фронтонами
    const roofBeam = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.12), woodMat);
    roofBeam.position.set(0, 2.85, 0);
    group.add(roofBeam);

    // Деревянные торцевые карнизные треугольники фронтона
    [-1.0, 1.0].forEach((px) => {
      const gableR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.3), woodMat);
      gableR.position.set(px, 2.45, 0.42);
      gableR.rotation.x = 0.65;
      group.add(gableR);

      const gableL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.3), woodMat);
      gableL.position.set(px, 2.45, -0.42);
      gableL.rotation.x = -0.65;
      group.add(gableL);
    });

    // Два ската синей крыши
    const slopeFront = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, 1.15), roofBlueMat);
    slopeFront.position.set(0, 2.5, 0.45);
    slopeFront.rotation.x = 0.65;
    group.add(slopeFront);

    const slopeBack = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, 1.15), roofBlueMat);
    slopeBack.position.set(0, 2.5, -0.45);
    slopeBack.rotation.x = -0.65;
    group.add(slopeBack);

    // 7. Деревянное ведёрко, стоящее на краю колодца
    const bucketGroup = new THREE.Group();
    bucketGroup.position.set(0.65, 1.07, 0.35);

    const bucketBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.11, 0.22, 6).toNonIndexed(),
      woodMat
    );
    bucketBody.position.set(0, 0.11, 0);
    bucketGroup.add(bucketBody);

    const bucketRim = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.03, 6), metalMat);
    bucketRim.position.set(0, 0.2, 0);
    bucketGroup.add(bucketRim);

    const bucketHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.015, 4, 8, Math.PI),
      metalMat
    );
    bucketHandle.rotation.z = Math.PI;
    bucketHandle.position.set(0, 0.22, 0);
    bucketGroup.add(bucketHandle);

    group.add(bucketGroup);

    return group;
  }

  /** Сосна: высокий ствол с плоскими зонтичными шапками хвои на вершине */
  private buildPine(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'PineRoot';

    const barkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0x234d31,
      roughness: 0.85,
      flatShading: true,
    });

    // Высокий голый ствол
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 4.5, 6), barkMat);
    trunk.position.set(0, 2.25, 0);
    group.add(trunk);

    // 3 приплюснутые шапки хвои на верхушке
    const cap1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), needleMat);
    cap1.scale.set(1.4, 0.65, 1.4);
    cap1.position.set(0.4, 4.1, 0.2);
    group.add(cap1);

    const cap2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), needleMat);
    cap2.scale.set(1.3, 0.6, 1.3);
    cap2.position.set(-0.5, 4.6, -0.3);
    group.add(cap2);

    const cap3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 0), needleMat);
    cap3.scale.set(1.1, 0.75, 1.1);
    cap3.position.set(0.0, 5.2, 0.0);
    group.add(cap3);

    return group;
  }

  /** Создает плоскую стрелку указателя с острием и крепежным болтом */
  private createArrowSignMesh(
    length: number,
    height: number,
    material: THREE.Material,
    boltMat: THREE.Material
  ): THREE.Group {
    const arrowGroup = new THREE.Group();
    const depth = 0.04;
    const bodyLen = length * 0.72;
    const tipLen = length * 0.28;

    const shape = new THREE.Shape();
    shape.moveTo(0, -height / 2);
    shape.lineTo(bodyLen, -height / 2);
    shape.lineTo(bodyLen, -height * 0.75);
    shape.lineTo(bodyLen + tipLen, 0);
    shape.lineTo(bodyLen, height * 0.75);
    shape.lineTo(bodyLen, height / 2);
    shape.lineTo(0, height / 2);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    const arrowMesh = new THREE.Mesh(geo, material);
    arrowGroup.add(arrowMesh);

    // Центральный крепежный болт
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, depth + 0.02, 8), boltMat);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(bodyLen * 0.45, 0, 0);
    arrowGroup.add(bolt);

    return arrowGroup;
  }

  /** Указатель дорог (3 цветные стрелки): синяя, коралловая и белая на круглом столбе с каменной базой */
  private buildSignpost(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SignpostRoot';

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x5c636e,
      roughness: 0.9,
      flatShading: true,
    });
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xc47d52,
      roughness: 0.8,
      flatShading: true,
    });
    const boltMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.5,
      metalness: 0.8,
      flatShading: true,
    });

    const matBlue = new THREE.MeshStandardMaterial({
      color: 0x4299e1,
      roughness: 0.65,
      flatShading: true,
    });
    const matRed = new THREE.MeshStandardMaterial({
      color: 0xdd5b66,
      roughness: 0.65,
      flatShading: true,
    });
    const matWhite = new THREE.MeshStandardMaterial({
      color: 0xecf0f1,
      roughness: 0.65,
      flatShading: true,
    });

    // 1. Каменный восьмигранный башмак в основании
    const baseGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 8).toNonIndexed();
    baseGeo.computeVertexNormals();
    const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
    baseMesh.position.set(0, 0.175, 0);
    group.add(baseMesh);

    // 2. Деревянный цилиндрический столб
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 2.1, 10), poleMat);
    pole.position.set(0, 1.15, 0);
    group.add(pole);

    // 3. Стрелка 1 (верхняя, синяя)
    const arrowTop = this.createArrowSignMesh(0.65, 0.16, matBlue, boltMat);
    arrowTop.position.set(0, 1.85, 0);
    arrowTop.rotation.y = Math.PI * 0.9;
    group.add(arrowTop);

    // 4. Стрелка 2 (средняя, коралловая)
    const arrowMid = this.createArrowSignMesh(0.55, 0.15, matRed, boltMat);
    arrowMid.position.set(0, 1.5, 0);
    arrowMid.rotation.y = -Math.PI * 0.25;
    group.add(arrowMid);

    // 5. Стрелка 3 (нижняя, белая)
    const arrowBot = this.createArrowSignMesh(0.7, 0.17, matWhite, boltMat);
    arrowBot.position.set(0, 1.15, 0);
    arrowBot.rotation.y = 0.0;
    group.add(arrowBot);

    return group;
  }

  /** Новый указатель дорог (1 стрелка) с каменным основанием */
  private buildSignpostSingle(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SignpostSingleRoot';

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x5c636e,
      roughness: 0.9,
      flatShading: true,
    });
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xc47d52,
      roughness: 0.8,
      flatShading: true,
    });
    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0xb8734c,
      roughness: 0.75,
      flatShading: true,
    });
    const boltMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.5,
      metalness: 0.8,
      flatShading: true,
    });

    // Каменное основание
    const baseGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 8).toNonIndexed();
    baseGeo.computeVertexNormals();
    const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
    baseMesh.position.set(0, 0.175, 0);
    group.add(baseMesh);

    // Деревянный столб
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 1.6, 10), poleMat);
    pole.position.set(0, 0.9, 0);
    group.add(pole);

    // Одиночная деревянная стрелка вправо с крепежом
    const arrow = this.createArrowSignMesh(0.68, 0.18, arrowMat, boltMat);
    arrow.position.set(0, 1.32, 0);
    group.add(arrow);

    return group;
  }

  /** Вспомогательный метод для создания одного шестигранного бревна со светлыми срезами */
  private createSingleLog(radius: number, length: number): THREE.Group {
    const logGroup = new THREE.Group();
    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x8a5229,
      roughness: 0.9,
      flatShading: true,
    });
    const cutMat = new THREE.MeshStandardMaterial({
      color: 0xe0ad70,
      roughness: 0.8,
      flatShading: true,
    });

    // 6-гранный цилиндр бревна, ориентированный вдоль оси Z
    const logGeo = new THREE.CylinderGeometry(radius, radius, length, 6, 1, false).toNonIndexed();
    logGeo.computeVertexNormals();
    logGeo.rotateX(Math.PI / 2);

    const logMesh = new THREE.Mesh(logGeo, barkMat);
    logGroup.add(logMesh);

    // Светлые спилы на торцах
    const endGeo = new THREE.CircleGeometry(radius * 0.96, 6);
    const endFront = new THREE.Mesh(endGeo, cutMat);
    endFront.position.set(0, 0, length / 2 + 0.002);
    logGroup.add(endFront);

    const endBack = new THREE.Mesh(endGeo, cutMat);
    endBack.rotation.y = Math.PI;
    endBack.position.set(0, 0, -length / 2 - 0.002);
    logGroup.add(endBack);

    return logGroup;
  }

  /** Вариант 1 стопки бревен: пирамида из 7 бревен со смещенным бревном сбоку по референсу */
  private buildLogPile1(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'LogPile1Root';

    const r = 0.18;
    const len = 1.6;

    // Нижний ряд (3 бревна + 1 лежащее слева)
    const logSide = this.createSingleLog(r * 0.95, len * 0.95);
    logSide.position.set(-0.68, r, 0.05);
    group.add(logSide);

    const l1 = this.createSingleLog(r, len);
    l1.position.set(-0.35, r, 0);
    group.add(l1);

    const l2 = this.createSingleLog(r, len);
    l2.position.set(0.0, r, 0);
    group.add(l2);

    const l3 = this.createSingleLog(r, len);
    l3.position.set(0.35, r, 0);
    group.add(l3);

    // Средний ряд (2 бревна в пазах)
    const l4 = this.createSingleLog(r, len);
    l4.position.set(-0.175, r + r * 1.6, 0.03);
    group.add(l4);

    const l5 = this.createSingleLog(r, len);
    l5.position.set(0.175, r + r * 1.6, -0.02);
    group.add(l5);

    // Верхнее бревно
    const l6 = this.createSingleLog(r, len);
    l6.position.set(0.0, r + r * 3.15, 0.02);
    group.add(l6);

    return group;
  }

  /** Вариант 2 стопки бревен: компактная поленница из 5 бревен (3 снизу, 2 сверху) */
  private buildLogPile2(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'LogPile2Root';

    const r = 0.18;
    const len = 1.5;

    // Нижний ряд (3 бревна)
    const l1 = this.createSingleLog(r, len);
    l1.position.set(-0.35, r, 0);
    group.add(l1);

    const l2 = this.createSingleLog(r, len);
    l2.position.set(0.0, r, 0);
    group.add(l2);

    const l3 = this.createSingleLog(r, len);
    l3.position.set(0.35, r, 0);
    group.add(l3);

    // Верхний ряд (2 бревна)
    const l4 = this.createSingleLog(r, len);
    l4.position.set(-0.175, r + r * 1.6, 0.02);
    group.add(l4);

    const l5 = this.createSingleLog(r, len);
    l5.position.set(0.175, r + r * 1.6, -0.02);
    group.add(l5);

    return group;
  }

  /** Пень с топором: колотый ствол со светлым спилом и низкополигональным топором по референсу */
  private buildStump(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'StumpRoot';

    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x8a5229,
      roughness: 0.9,
      flatShading: true,
    });
    const cutMat = new THREE.MeshStandardMaterial({
      color: 0xdeb078,
      roughness: 0.8,
      flatShading: true,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x95a5a6,
      roughness: 0.35,
      metalness: 0.8,
      flatShading: true,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xb57348,
      roughness: 0.75,
      flatShading: true,
    });

    // 8-гранный массивный ствол пня
    const stumpH = 0.75;
    const stumpR = 0.44;
    const stumpGeo = new THREE.CylinderGeometry(
      stumpR * 0.92,
      stumpR,
      stumpH,
      8,
      1,
      false
    ).toNonIndexed();
    stumpGeo.computeVertexNormals();
    const stumpMesh = new THREE.Mesh(stumpGeo, barkMat);
    stumpMesh.position.set(0, stumpH / 2, 0);
    stumpMesh.rotation.y = Math.PI / 8;
    group.add(stumpMesh);

    // Светлый спил на верхней плоскости
    const cutTop = new THREE.Mesh(new THREE.CircleGeometry(stumpR * 0.91, 8), cutMat);
    cutTop.rotation.x = -Math.PI / 2;
    cutTop.rotation.z = Math.PI / 8;
    cutTop.position.set(0, stumpH + 0.002, 0);
    group.add(cutTop);

    // Топор, врубленный в пень
    const axeGroup = new THREE.Group();
    axeGroup.position.set(-0.06, stumpH, 0);

    // Лезвие топора
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.22), steelMat);
    blade.position.set(0, 0.05, 0.02);
    blade.rotation.x = 0.15;
    axeGroup.add(blade);

    // Длинное деревянное топорище
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.048, 0.72), handleMat);
    handle.position.set(0, 0.17, 0.26);
    handle.rotation.x = -0.32;
    axeGroup.add(handle);

    group.add(axeGroup);

    return group;
  }

  /** Уличный сельский туалет: деревянная кабинка с наклонной крышей и вырезом полумесяца */
  private buildToilet(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'ToiletRoot';

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x936348,
      roughness: 0.85,
      flatShading: true,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x734832,
      roughness: 0.8,
      flatShading: true,
    });
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x82543c,
      roughness: 0.85,
      flatShading: true,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xdcdcdc,
      roughness: 0.4,
      metalness: 0.6,
      flatShading: true,
    });
    const darkHoleMat = new THREE.MeshStandardMaterial({
      color: 0x24160f,
      roughness: 0.9,
      flatShading: true,
    });

    const w = 1.15;
    const d = 1.15;
    const hFront = 2.25;
    const hBack = 1.95;

    // Стены кабинки (Правильная трапециевидная призма, чтобы крыша не пересекалась)
    const cabinGeo = new THREE.BoxGeometry(w, 1, d).toNonIndexed();
    const pos = cabinGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y > 0) {
        // Верхние вершины: высота зависит от положения по оси Z (глубина)
        const t = (z + d / 2) / d; // 0 сзади, 1 спереди
        const localH = hBack + (hFront - hBack) * t;
        pos.setY(i, localH);
      } else {
        // Плоское дно у земли
        pos.setY(i, 0);
      }
    }
    cabinGeo.computeVertexNormals();
    const cabin = new THREE.Mesh(cabinGeo, woodMat);
    group.add(cabin);

    // Наклонная односкатная крыша с выносом козырька
    const roofSlopeAngle = Math.atan2(hFront - hBack, d);
    const roofL = Math.hypot(d, hFront - hBack);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, 0.09, roofL + 0.35), roofMat);
    roof.position.set(0, (hFront + hBack) / 2 + 0.04, 0.0);
    roof.rotation.x = -roofSlopeAngle;
    group.add(roof);

    // Дверь туалета на фасаде
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.8, 0.05), doorMat);
    door.position.set(0, 0.95, d / 2 + 0.026);
    group.add(door);

    // Петли двери
    [-0.55, 0.55].forEach((dy) => {
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.02), metalMat);
      hinge.position.set(0.36, 0.95 + dy, d / 2 + 0.04);
      group.add(hinge);
    });

    // Дверная ручка-скоба
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.05), metalMat);
    handle.position.set(-0.28, 0.95, d / 2 + 0.055);
    group.add(handle);

    // Символ полумесяца в верхней части двери
    const moon = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.022, 6, 12, Math.PI * 1.3),
      darkHoleMat
    );
    moon.rotation.z = Math.PI * 0.85;
    moon.position.set(0, 1.55, d / 2 + 0.052);
    group.add(moon);

    return group;
  }

  /** Низкополигональная бочка с выпуклыми боками и стальными обручами */
  private buildBarrel(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BarrelRoot';

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x935c2b,
      roughness: 0.8,
      flatShading: true,
    });
    const woodLidMat = new THREE.MeshStandardMaterial({
      color: 0x804e22,
      roughness: 0.85,
      flatShading: true,
    });
    const hoopMat = new THREE.MeshStandardMaterial({
      color: 0x68788a,
      roughness: 0.5,
      metalness: 0.65,
      flatShading: true,
    });

    const segments = 10;
    const height = 1.1;
    const rBase = 0.42;
    const rMid = 0.52;

    // Нижняя половина бочки (расширение к центру)
    const lowerGeo = new THREE.CylinderGeometry(
      rMid,
      rBase,
      height / 2,
      segments,
      1,
      false
    ).toNonIndexed();
    lowerGeo.computeVertexNormals();
    const lowerMesh = new THREE.Mesh(lowerGeo, woodMat);
    lowerMesh.position.set(0, height / 4, 0);
    group.add(lowerMesh);

    // Верхняя половина бочки (сужение к верху)
    const upperGeo = new THREE.CylinderGeometry(
      rBase,
      rMid,
      height / 2,
      segments,
      1,
      false
    ).toNonIndexed();
    upperGeo.computeVertexNormals();
    const upperMesh = new THREE.Mesh(upperGeo, woodMat);
    upperMesh.position.set(0, (height * 3) / 4, 0);
    group.add(upperMesh);

    // Утопленная верхняя крышка
    const topLid = new THREE.Mesh(new THREE.CircleGeometry(rBase * 0.94, segments), woodLidMat);
    topLid.rotation.x = -Math.PI / 2;
    topLid.position.set(0, height - 0.02, 0);
    group.add(topLid);

    // Металлические обручи (верхний и нижний)
    const rHoop = (rBase + rMid) / 2 + 0.015;
    const hoopTop = new THREE.Mesh(
      new THREE.CylinderGeometry(rHoop, rHoop, 0.06, segments, 1, true),
      hoopMat
    );
    hoopTop.position.set(0, 0.78, 0);
    group.add(hoopTop);

    const hoopBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(rHoop, rHoop, 0.06, segments, 1, true),
      hoopMat
    );
    hoopBottom.position.set(0, 0.32, 0);
    group.add(hoopBottom);

    return group;
  }

  /** Открытый деревянный ящик по референсу */
  private buildCrateProp(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'CratePropRoot';

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x9e6c46,
      roughness: 0.85,
      flatShading: true,
    });
    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x7e5233,
      roughness: 0.9,
      flatShading: true,
    });

    const w = 1.1;
    const d = 0.85;
    const h = 0.58;
    const postW = 0.09;
    const slatT = 0.04;

    // 4 угловых бруска
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, h, postW), darkWoodMat);
        post.position.set(sx * (w / 2 - postW / 2), h / 2, sz * (d / 2 - postW / 2));
        group.add(post);
      });
    });

    // Дно ящика
    const bottom = new THREE.Mesh(
      new THREE.BoxGeometry(w - postW * 2, slatT, d - postW * 2),
      woodMat
    );
    bottom.position.set(0, slatT / 2, 0);
    group.add(bottom);

    // Боковые планки (по 2 горизонтальные доски на каждой стороне)
    [0.16, 0.44].forEach((py) => {
      // Длинные стороны
      [-1, 1].forEach((sz) => {
        const slatLong = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, slatT), woodMat);
        slatLong.position.set(0, py, sz * (d / 2 - slatT / 2));
        group.add(slatLong);
      });

      // Короткие стороны
      [-1, 1].forEach((sx) => {
        const slatShort = new THREE.Mesh(
          new THREE.BoxGeometry(slatT, 0.18, d - postW * 2),
          woodMat
        );
        slatShort.position.set(sx * (w / 2 - slatT / 2), py, 0);
        group.add(slatShort);
      });
    });

    return group;
  }

  /** Столбик с фонарем: деревянный столб 3.0м с кованым кронштейном и масляным фонарем */
  private buildLampPost(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'LampPostRoot';

    const woodTex = this.createWoodPlankTexture(true);
    const postMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0x5d4037,
      roughness: 0.85,
      flatShading: true,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.5,
      metalness: 0.8,
    });
    const lanternGlassMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xf59e0b),
      emissiveIntensity: 0.85,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
    });

    // Вертикальный граненый столб высотой 3.0 м
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.16), postMat);
    pole.position.set(0, 1.5, 0);
    group.add(pole);

    // Декоративный железный наконечник на столбе
    const poleCap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 4), ironMat);
    poleCap.position.set(0, 3.11, 0);
    poleCap.rotation.y = Math.PI / 4;
    group.add(poleCap);

    // Кованый кронштейн, выступающий вперед
    const armH = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.04), ironMat);
    armH.position.set(0.23, 2.82, 0);
    group.add(armH);

    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.035), ironMat);
    brace.position.set(0.15, 2.67, 0);
    brace.rotation.z = -Math.PI / 4;
    group.add(brace);

    // Фонарь (подвес, стеклянная колба, козырек)
    const lanternRoot = new THREE.Group();
    lanternRoot.position.set(0.42, 2.65, 0);

    // Кольцо подвеса
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), ironMat);
    ring.position.set(0, 0.18, 0);
    lanternRoot.add(ring);

    // Крышка фонаря
    const lCap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.1, 4), ironMat);
    lCap.position.set(0, 0.1, 0);
    lCap.rotation.y = Math.PI / 4;
    lanternRoot.add(lCap);

    // Светящаяся колба фонаря
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), lanternGlassMat);
    glass.position.set(0, -0.04, 0);
    lanternRoot.add(glass);

    // Металлическое основание фонаря
    const lBase = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.19), ironMat);
    lBase.position.set(0, -0.16, 0);
    lanternRoot.add(lBase);

    group.add(lanternRoot);

    return group;
  }

  private buildBall(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BallRoot';

    const radius = 0.15;
    const geometry = new THREE.SphereGeometry(radius, 24, 18);

    // Процедурная текстура спортивного мяча со швами
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Яркий спортивный лаймово-желтый цвет
    ctx.fillStyle = '#bfe228';
    ctx.fillRect(0, 0, 256, 128);

    // Белые фигурные швы
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 64 + Math.sin((x / 256) * Math.PI * 2) * 36;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 64 + Math.cos((x / 256) * Math.PI * 2) * 36;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.75,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  /** Красный low-poly рюкзак со скошенными гранями, карманом и нашивкой по референсу */
  private buildBackpack(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BackpackRoot';

    const redFabricMat = new THREE.MeshStandardMaterial({
      color: 0xcc1f1f,
      roughness: 0.85,
      flatShading: true,
    });
    const darkZipMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.7,
      flatShading: true,
    });
    const patchMat = new THREE.MeshStandardMaterial({
      color: 0x935c34,
      roughness: 0.9,
      flatShading: true,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.8,
      flatShading: true,
    });

    // 1. Основной корпус со скошенными верхними и боковыми гранями
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-0.2, -0.26);
    bodyShape.lineTo(0.2, -0.26);
    bodyShape.lineTo(0.24, 0.12);
    bodyShape.lineTo(0.13, 0.26);
    bodyShape.lineTo(-0.13, 0.26);
    bodyShape.lineTo(-0.24, 0.12);
    bodyShape.closePath();

    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.03,
      bevelThickness: 0.03,
    });
    bodyGeo.center();
    const mainBody = new THREE.Mesh(bodyGeo, redFabricMat);
    group.add(mainBody);

    // Центральная полоса молнии основного отсека
    const mainZip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.44, 0.24), darkZipMat);
    mainZip.position.set(-0.16, 0.02, 0);
    group.add(mainZip);

    // 2. Передний выпуклый карман
    const pocketShape = new THREE.Shape();
    pocketShape.moveTo(-0.16, -0.12);
    pocketShape.lineTo(0.16, -0.12);
    pocketShape.lineTo(0.17, 0.06);
    pocketShape.lineTo(0.12, 0.12);
    pocketShape.lineTo(-0.12, 0.12);
    pocketShape.lineTo(-0.17, 0.06);
    pocketShape.closePath();

    const pocketGeo = new THREE.ExtrudeGeometry(pocketShape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015,
    });
    pocketGeo.center();
    const pocket = new THREE.Mesh(pocketGeo, redFabricMat);
    pocket.position.set(0, -0.1, 0.155);
    group.add(pocket);

    // Горизонтальная молния переднего кармана
    const pocketZip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.025), darkZipMat);
    pocketZip.position.set(0, -0.06, 0.205);
    group.add(pocketZip);

    // Бегунок молнии кармана
    const puller = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.02), handleMat);
    puller.position.set(-0.02, -0.075, 0.218);
    group.add(puller);

    // 3. Коричневый патч/нашивка сверху
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.015), patchMat);
    patch.position.set(0, 0.12, 0.135);
    group.add(patch);

    // 4. Верхняя дугообразная ручка для переноски
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.06, 0.24, -0.02),
      new THREE.Vector3(-0.05, 0.36, -0.02),
      new THREE.Vector3(0.05, 0.36, -0.02),
      new THREE.Vector3(0.06, 0.24, -0.02),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 6, 0.018, 4, false);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    group.add(handle);

    // 5. Вспомогательная нода для хвата в руку (GripPoint) при сбросе/удержании
    const gripPoint = new THREE.Object3D();
    gripPoint.name = 'GripPoint';
    gripPoint.position.set(0, 0.32, -0.02);
    gripPoint.rotation.set(-Math.PI / 2, 0, 0);
    group.add(gripPoint);

    return group;
  }

  // --- ТЕКСТУРНЫЕ ГЕНЕРАТОРЫ ДЛЯ LOW-POLY ОБЪЕКТОВ ---

  private createStoneMasonryTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Раствор (швы между камнями)
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(0, 0, 512, 256);

    // Рисуем ряды декоративных округлых low-poly булыжников
    const stoneColors = ['#9ca3af', '#cbd5e1', '#64748b', '#94a3b8', '#b0bec5'];
    const rows = 4;
    const cols = 8;
    const cellW = 512 / cols;
    const cellH = 256 / rows;

    for (let r = 0; r < rows; r++) {
      const offsetX = (r % 2) * (cellW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const cx = c * cellW + offsetX + cellW * 0.5;
        const cy = r * cellH + cellH * 0.5;
        const color = stoneColors[(r * 5 + c * 3 + 17) % stoneColors.length];

        ctx.fillStyle = color;
        ctx.beginPath();
        const rw = cellW * 0.42;
        const rh = cellH * 0.38;

        // Рисуем многоугольный граненый камень
        const pts = 6;
        for (let i = 0; i < pts; i++) {
          const angle = (i / pts) * Math.PI * 2;
          const jitter = 0.85 + Math.sin(r * 11 + c * 7 + i * 3) * 0.15;
          const px = cx + Math.cos(angle) * rw * jitter;
          const py = cy + Math.sin(angle) * rh * jitter;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Светотень на камне
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private createWoodPlankTexture(dark: boolean = false): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const baseColor = dark ? '#5d4037' : '#8d6e63';
    const grainColor = dark ? '#4e342e' : '#795548';

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = grainColor;
    ctx.lineWidth = 4;
    for (let i = 0; i < 20; i++) {
      const y = (i / 20) * 256;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y + Math.sin(i) * 6, 170, y - Math.cos(i) * 6, 256, y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createRoofTilesTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Терракотовая черепица
    ctx.fillStyle = '#b93a2b';
    ctx.fillRect(0, 0, 256, 256);

    const rows = 6;
    const cols = 5;
    const rw = 256 / cols;
    const rh = 256 / rows;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (rw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * rw + offset;
        const y = r * rh;

        ctx.fillStyle = r % 2 === 0 ? '#c94435' : '#aa3325';
        ctx.fillRect(x + 2, y + 2, rw - 4, rh - 4);

        // Грани черепицы
        ctx.strokeStyle = '#852115';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, rw - 4, rh - 4);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private createRockTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Яркая базовая каменная текстура
    ctx.fillStyle = '#9aa4b2';
    ctx.fillRect(0, 0, 256, 256);

    // Светлые пятна сколов и минералов
    ctx.fillStyle = '#c5d0de';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const w = 15 + Math.random() * 40;
      const h = 8 + Math.random() * 20;
      ctx.fillRect(x, y, w, h);
    }

    // Трещины умеренного контраста
    ctx.strokeStyle = '#707b8a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      const sx = Math.random() * 256;
      const sy = Math.random() * 256;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 60);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private getRockTexture(): THREE.CanvasTexture {
    if (this.cachedRockTexture) return this.cachedRockTexture;
    this.cachedRockTexture = this.createRockTexture();
    return this.cachedRockTexture;
  }

  // --- 1. ДОМ С НАКЛОННОЙ КРЫШЕЙ (LOW-POLY HOUSE) ---

  private buildHouse(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'HouseRoot';

    const stoneTex = this.createStoneMasonryTexture();
    stoneTex.repeat.set(2, 1);
    const roofTex = this.createRoofTilesTexture();
    roofTex.repeat.set(2, 2);
    const woodTex = this.createWoodPlankTexture(false);
    const darkWoodTex = this.createWoodPlankTexture(true);

    // Материалы
    const foundationMat = new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.85,
      metalness: 0.05,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf6cf65,
      roughness: 0.7,
      metalness: 0.0,
      flatShading: true,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      map: roofTex,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: true,
    });
    const chimneyMat = new THREE.MeshStandardMaterial({
      color: 0xd97736,
      roughness: 0.8,
      metalness: 0.05,
      flatShading: true,
    });
    const woodTrimMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0xc89666,
      roughness: 0.8,
    });
    const doorMat = new THREE.MeshStandardMaterial({
      map: darkWoodTex,
      roughness: 0.75,
    });
    const windowFrameMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x5dade2,
      roughness: 0.2,
      metalness: 0.3,
    });
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.95,
      flatShading: true,
    });

    // 1. Каменный цоколь (Foundation) с вырезом под входную дверь
    // Основной массив фундамента (до линии фасада)
    const foundationMain = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.8, 4.7), foundationMat);
    foundationMain.position.set(0, 0.4, -0.35);
    group.add(foundationMain);

    // Левый блок цоколя на фасаде (слева от двери)
    const foundationLeft = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.8, 0.7), foundationMat);
    foundationLeft.position.set(-1.975, 0.4, 2.35);
    group.add(foundationLeft);

    // Правый блок цоколя на фасаде (справа от двери)
    const foundationRight = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.8, 0.7), foundationMat);
    foundationRight.position.set(1.075, 0.4, 2.35);
    group.add(foundationRight);

    // 2. Основной корпус стен (Walls)
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.2, 5.2), wallMat);
    walls.position.set(0, 1.9, 0);
    group.add(walls);

    // 3. Фронтоны (Gables) спереди и сзади через треугольную призму
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-2.4, 0);
    gableShape.lineTo(2.4, 0);
    gableShape.lineTo(0, 2.2);
    gableShape.closePath();

    const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
      depth: 5.2,
      bevelEnabled: false,
    });
    gableGeo.translate(0, 0, -2.6); // Центрируем по Z
    const gables = new THREE.Mesh(gableGeo, wallMat);
    gables.position.set(0, 3.0, 0);
    group.add(gables);

    // 4. Двускатная наклонная крыша (Roof Slabs)
    // Угол наклона: atan2(2.45, 2.8) = ~0.72 рад (41 градус)
    const roofSlopeAngle = Math.atan2(2.45, 2.8);
    const roofPanelW = 3.65;
    const roofPanelL = 5.8;
    const roofThickness = 0.14;

    // Правый скат крыши
    const roofRight = new THREE.Mesh(
      new THREE.BoxGeometry(roofPanelW, roofThickness, roofPanelL),
      roofMat
    );
    roofRight.position.set(1.36, 4.08, 0);
    roofRight.rotation.z = -roofSlopeAngle;
    group.add(roofRight);

    // Левый скат крыши
    const roofLeft = new THREE.Mesh(
      new THREE.BoxGeometry(roofPanelW, roofThickness, roofPanelL),
      roofMat
    );
    roofLeft.position.set(-1.36, 4.08, 0);
    roofLeft.rotation.z = roofSlopeAngle;
    group.add(roofLeft);

    // Конек крыши (Ridge cap)
    const roofRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.14, roofPanelL + 0.05),
      chimneyMat
    );
    roofRidge.position.set(0, 5.3, 0);
    group.add(roofRidge);

    // Торцевые карнизные доски крыши (Wooden Bargeboards)
    const bargeboardMat = woodTrimMat;
    [-2.9, 2.9].forEach((zPos) => {
      const bLeft = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.08), bargeboardMat);
      bLeft.position.set(-1.36, 4.08, zPos);
      bLeft.rotation.z = roofSlopeAngle;
      group.add(bLeft);

      const bRight = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.08), bargeboardMat);
      bRight.position.set(1.36, 4.08, zPos);
      bRight.rotation.z = -roofSlopeAngle;
      group.add(bRight);
    });

    // 5. Входная дверь (Door), порог и козырек на фасаде (+Z)
    // Теперь дверь опущена до порога (y=0.16) и видна целиком без перекрытия фундаментом
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.8, 0.08), doorMat);
    door.position.set(-0.9, 1.06, 2.58);
    group.add(door);

    // Арочное стекло в двери
    const doorGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 12), glassMat);
    doorGlass.rotation.x = Math.PI / 2;
    doorGlass.position.set(-0.9, 1.55, 2.63);
    group.add(doorGlass);

    // Дверная ручка
    const doorHandle = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.8, roughness: 0.3 })
    );
    doorHandle.position.set(-0.52, 1.05, 2.64);
    group.add(doorHandle);

    // Порог перед дверью (на земле перед дверным проемом)
    const doorStep = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 0.5), foundationMat);
    doorStep.position.set(-0.9, 0.08, 2.85);
    group.add(doorStep);

    // Наклонный козырек над дверью
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.7), roofMat);
    canopy.position.set(-0.9, 2.05, 2.9);
    canopy.rotation.x = 0.35; // наклон вперед
    group.add(canopy);

    // Деревянные подкосы козырька
    [-0.55, 0.55].forEach((dx) => {
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.45), woodTrimMat);
      corbel.position.set(-0.9 + dx, 1.85, 2.8);
      corbel.rotation.x = -0.4;
      group.add(corbel);
    });

    // 6. Окна (Windows) с вдавленной поверхностью стекла вглубь коробки рамы
    // Большое окно первого этажа на главном фасаде (+Z)
    const winFront = this.createRecessedWindow(
      1.6,
      1.1,
      windowFrameMat,
      glassMat,
      woodTrimMat,
      true
    );
    winFront.position.set(1.1, 1.6, 2.64);
    group.add(winFront);

    // Чердачное окно во фронтоне (над дверью)
    const winAttic = this.createRecessedWindow(
      0.68,
      0.95,
      windowFrameMat,
      glassMat,
      woodTrimMat,
      false
    );
    winAttic.position.set(-0.9, 3.8, 2.64);
    group.add(winAttic);

    // Боковые окна (по 2 на восточной и западной стенах)
    [-1.0, 1.0].forEach((zSide) => {
      // Восточная стена (+X)
      const winEast = this.createRecessedWindow(
        0.85,
        0.95,
        windowFrameMat,
        glassMat,
        woodTrimMat,
        false
      );
      winEast.position.set(2.44, 1.7, zSide);
      winEast.rotation.y = Math.PI / 2;
      group.add(winEast);

      // Западная стена (-X)
      const winWest = this.createRecessedWindow(
        0.85,
        0.95,
        windowFrameMat,
        glassMat,
        woodTrimMat,
        false
      );
      winWest.position.set(-2.44, 1.7, zSide);
      winWest.rotation.y = -Math.PI / 2;
      group.add(winWest);
    });

    // 7. Дымоход (Chimney) без визуализации дыма
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.6, 0.65), chimneyMat);
    chimney.position.set(0.85, 4.75, 0.7);
    group.add(chimney);

    const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.8), foundationMat);
    chimneyCap.position.set(0.85, 5.58, 0.7);
    group.add(chimneyCap);

    return group;
  }

  /**
   * Создает оконный блок с полым наличником и глубоко утопленным внутрь стеклом,
   * полностью исключая z-fighting и пересечение поверхностей.
   */
  private createRecessedWindow(
    width: number,
    height: number,
    frameMat: THREE.Material,
    glassMat: THREE.Material,
    sillMat?: THREE.Material,
    hasDivider: boolean = false
  ): THREE.Group {
    const winGroup = new THREE.Group();
    const borderT = 0.08;
    const frameDepth = 0.12;

    // Верхняя перекладина наличника
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(width, borderT, frameDepth), frameMat);
    topBar.position.set(0, height / 2 - borderT / 2, 0);
    winGroup.add(topBar);

    // Нижняя перекладина наличника
    const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(width, borderT, frameDepth), frameMat);
    bottomBar.position.set(0, -height / 2 + borderT / 2, 0);
    winGroup.add(bottomBar);

    // Левая и правая стойки наличника
    const innerH = height - borderT * 2;
    const leftBar = new THREE.Mesh(new THREE.BoxGeometry(borderT, innerH, frameDepth), frameMat);
    leftBar.position.set(-width / 2 + borderT / 2, 0, 0);
    winGroup.add(leftBar);

    const rightBar = new THREE.Mesh(new THREE.BoxGeometry(borderT, innerH, frameDepth), frameMat);
    rightBar.position.set(width / 2 - borderT / 2, 0, 0);
    winGroup.add(rightBar);

    // Вертикальный средний импост
    if (hasDivider) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(borderT * 0.7, innerH, frameDepth * 0.7),
        frameMat
      );
      divider.position.set(0, 0, -frameDepth * 0.1);
      winGroup.add(divider);
    }

    // Стекло расположено внутри образованной ниши и утоплено назад
    const glassW = width - borderT * 2 - 0.02;
    const glassH = height - borderT * 2 - 0.02;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, 0.02), glassMat);
    glass.position.set(0, 0, -frameDepth * 0.3);
    winGroup.add(glass);

    // Подоконник
    if (sillMat) {
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.14, 0.06, frameDepth + 0.08),
        sillMat
      );
      sill.position.set(0, -height / 2 - 0.02, frameDepth * 0.25);
      winGroup.add(sill);
    }

    return winGroup;
  }

  // --- 2. ДЕРЕВЯННЫЙ ЗАБОР (LOW-POLY WOODEN FENCE) ---

  private buildFence(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'FenceRoot';

    const woodTex = this.createWoodPlankTexture(false);
    const postTex = this.createWoodPlankTexture(true);

    const postMat = new THREE.MeshStandardMaterial({
      map: postTex,
      color: 0x6d4c41,
      roughness: 0.85,
      flatShading: true,
    });
    const plankMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0x8d6e63,
      roughness: 0.8,
      flatShading: true,
    });

    // 1. Опорные столбы по краям (длина секции 2.4 м)
    [-1.15, 1.15].forEach((xPos) => {
      // Вертикальный граненый столб
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), postMat);
      post.position.set(xPos, 0.525, 0);
      group.add(post);

      // Пирамидальное навершие столба
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 4), postMat);
      cap.position.set(xPos, 1.12, 0);
      cap.rotation.y = Math.PI / 4;
      group.add(cap);
    });

    // 2. Горизонтальные брусья (поперечины)
    const railBottom = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.06, 0.05), postMat);
    railBottom.position.set(0, 0.32, -0.03);
    group.add(railBottom);

    const railTop = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.06, 0.05), postMat);
    railTop.position.set(0, 0.74, -0.03);
    group.add(railTop);

    // 3. Вертикальные доски штакетника с заостренным верхом
    const picketXOffsets = [-0.95, -0.57, -0.19, 0.19, 0.57, 0.95];
    picketXOffsets.forEach((px, i) => {
      // Тело доски
      const picket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.035), plankMat);
      picket.position.set(px, 0.45, 0.02);
      group.add(picket);

      // Заостренная 4-гранная верхушка
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.18, 4), plankMat);
      tip.position.set(px, 0.94, 0.02);
      tip.rotation.y = Math.PI / 4;
      // Легкий естественный наклон для живости
      tip.rotation.z = Math.sin(i * 3.7) * 0.03;
      group.add(tip);
    });

    return group;
  }

  // --- 3. НАБОР КАМНЕЙ (5 ВАРИАНТОВ LOW-POLY ROCKS) ---

  /**
   * Универсальный и надежный генератор деформированных процедурных камней.
   * Обязательно преобразует Indexed геометрию в NonIndexed для исключения черных артефактов нормалей (Z-fighting и flatShading баги).
   */
  private applyRockDeformation(
    baseGeo: THREE.BufferGeometry,
    seed: number,
    sx: number,
    sy: number,
    sz: number,
    cutBottom: number
  ): THREE.BufferGeometry {
    // Критически важно для flatShading и изменения вершин стандартных примитивов
    let geo = baseGeo.toNonIndexed();
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Процедурный деформационный шум на основе seed
      const nx = Math.sin(x * 4.1 + seed) * 0.15 + Math.cos(z * 3.2 - seed) * 0.1;
      const ny = Math.cos(y * 3.7 + seed) * 0.15 + Math.sin(x * 2.5 + seed) * 0.1;
      const nz = Math.sin(z * 4.5 - seed) * 0.15 + Math.cos(y * 2.8 + seed) * 0.1;

      x = (x + nx) * sx;
      y = (y + ny) * sy;
      z = (z + nz) * sz;

      // Срезаем дно, чтобы валун устойчиво лежал на земле
      if (y < cutBottom) y = cutBottom;

      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  private buildRock(variant: number): THREE.Group {
    switch (variant) {
      case 1:
        return this.buildRock1();
      case 2:
        return this.buildRock2();
      case 3:
        return this.buildRock3();
      case 4:
        return this.buildRock4();
      case 5:
      default:
        return this.buildRock5();
    }
  }

  /** Вариант 1: Остроконечный скальный блок с диагональным гребнем скола */
  private buildRock1(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Rock1Root';

    const geo = this.applyRockDeformation(
      new THREE.IcosahedronGeometry(1.0, 0),
      1.1,
      1.0,
      1.4,
      0.7,
      -0.6
    );
    geo.translate(0, 0.6, 0);

    const rockMat = new THREE.MeshStandardMaterial({
      map: this.getRockTexture(),
      color: 0x98a2af,
      roughness: 0.82,
      metalness: 0.05,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, rockMat);
    group.add(mesh);
    return group;
  }

  /** Вариант 2: Столообразный низкий валун-плитняк со скошенными фасками */
  private buildRock2(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Rock2Root';

    const geo = this.applyRockDeformation(
      new THREE.DodecahedronGeometry(1.0, 0),
      2.2,
      1.1,
      0.5,
      0.85,
      -0.4
    );
    geo.translate(0, 0.4, 0);

    const rockMat = new THREE.MeshStandardMaterial({
      map: this.getRockTexture(),
      color: 0x78808d,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, rockMat);
    group.add(mesh);
    return group;
  }

  /** Вариант 3: Ступенчатый многоярусный валун (нижняя платформа + верхняя плита) */
  private buildRock3(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Rock3Root';

    const rockMat = new THREE.MeshStandardMaterial({
      map: this.getRockTexture(),
      color: 0x6e7683,
      roughness: 0.88,
      metalness: 0.05,
      flatShading: true,
    });

    // Нижний широкий массив
    const baseGeo = this.applyRockDeformation(
      new THREE.CylinderGeometry(1.1, 1.3, 0.8, 7),
      3.3,
      1.0,
      1.0,
      1.0,
      -0.4
    );
    baseGeo.translate(0, 0.4, 0);
    const baseMesh = new THREE.Mesh(baseGeo, rockMat);
    group.add(baseMesh);

    // Верхняя ступенчатая надстройка
    const topGeo = this.applyRockDeformation(
      new THREE.CylinderGeometry(0.7, 0.8, 0.6, 6),
      3.4,
      1.0,
      1.0,
      1.0,
      -0.3
    );
    topGeo.translate(0.1, 1.1, -0.1);
    const topMesh = new THREE.Mesh(topGeo, rockMat);
    group.add(topMesh);

    return group;
  }

  /** Вариант 4: Крупный окатанный многогранный валун */
  private buildRock4(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Rock4Root';

    const geo = this.applyRockDeformation(
      new THREE.DodecahedronGeometry(1.0, 0),
      4.4,
      1.1,
      1.1,
      1.0,
      -0.6
    );
    geo.translate(0, 0.6, 0);

    const rockMat = new THREE.MeshStandardMaterial({
      map: this.getRockTexture(),
      color: 0x737b88,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, rockMat);
    group.add(mesh);
    return group;
  }

  /** Вариант 5: Массивный кубический монолит с крутыми плоскостями скалывания */
  private buildRock5(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Rock5Root';

    const geo = this.applyRockDeformation(
      new THREE.BoxGeometry(1.4, 1.4, 1.4, 2, 2, 2),
      5.5,
      1.0,
      1.0,
      0.85,
      -0.7
    );
    geo.translate(0, 0.7, 0);

    const rockMat = new THREE.MeshStandardMaterial({
      map: this.getRockTexture(),
      color: 0x69717e,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, rockMat);
    group.add(mesh);
    return group;
  }

  /** Низкополигональный деревянный выгнутый мост */
  private buildBridge(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BridgeRoot';

    const woodTex = this.createWoodPlankTexture(false);
    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0xb57b4f,
      roughness: 0.85,
      flatShading: true,
    });
    const darkWoodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0x8a5229,
      roughness: 0.9,
      flatShading: true,
    });

    const length = 6.0;
    const width = 2.4;
    const archHeight = 0.8;
    const segments = 16;

    // 1. Поперечные доски моста (настил)
    const plankGeo = new THREE.BoxGeometry(width - 0.2, 0.08, (length / segments) * 0.9);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -length / 2 + t * length;
      const archFactor = Math.sin(t * Math.PI);
      const y = archFactor * archHeight;
      const angle = -Math.cos(t * Math.PI) * (archHeight / (length / 2)); // Производная синусоиды

      const plank = new THREE.Mesh(plankGeo, woodMat);
      plank.position.set(0, y, z);
      plank.rotation.x = angle;
      group.add(plank);
    }

    // 2. Изогнутые продольные несущие балки (2 штуки по краям)
    const beamShape = new THREE.Shape();
    beamShape.moveTo(0, -0.15);
    beamShape.lineTo(0.12, -0.15);
    beamShape.lineTo(0.12, 0.15);
    beamShape.lineTo(0, 0.15);
    beamShape.closePath();

    const pathPoints = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pathPoints.push(
        new THREE.Vector3(0, Math.sin(t * Math.PI) * archHeight - 0.06, -length / 2 + t * length)
      );
    }
    const path = new THREE.CatmullRomCurve3(pathPoints);
    const beamGeo = new THREE.ExtrudeGeometry(beamShape, {
      steps: 12,
      extrudePath: path,
      bevelEnabled: false,
    });

    [-width / 2 + 0.1, width / 2 - 0.1].forEach((px) => {
      const beam = new THREE.Mesh(beamGeo, darkWoodMat);
      beam.position.x = px - 0.06; // Центровка профиля
      group.add(beam);
    });

    // 3. Четыре массивных столба по углам
    const postGeo = new THREE.BoxGeometry(0.25, 1.2, 0.25);
    [-1, 1].forEach((sz) => {
      [-1, 1].forEach((sx) => {
        const post = new THREE.Mesh(postGeo, darkWoodMat);
        post.position.set(sx * (width / 2), 0.6, sz * (length / 2 - 0.15));
        group.add(post);
      });
    });

    // 4. Изогнутые перила (поручни)
    const railPoints = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      railPoints.push(
        new THREE.Vector3(
          0,
          Math.sin(t * Math.PI) * archHeight + 1.05,
          -length / 2 + 0.15 + t * (length - 0.3)
        )
      );
    }
    const railPath = new THREE.CatmullRomCurve3(railPoints);
    const railShape = new THREE.Shape();
    railShape.moveTo(-0.06, -0.06);
    railShape.lineTo(0.06, -0.06);
    railShape.lineTo(0.06, 0.06);
    railShape.lineTo(-0.06, 0.06);
    const railGeo = new THREE.ExtrudeGeometry(railShape, {
      steps: 8,
      extrudePath: railPath,
      bevelEnabled: false,
    });

    [-width / 2, width / 2].forEach((px) => {
      const rail = new THREE.Mesh(railGeo, woodMat);
      rail.position.x = px;
      group.add(rail);

      // Промежуточные опорные стойки перил
      for (let j = 1; j < 4; j++) {
        const t = j / 4;
        const pz = -length / 2 + 0.15 + t * (length - 0.3);
        const py = Math.sin(t * Math.PI) * archHeight;
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), darkWoodMat);
        sp.position.set(px, py + 0.5, pz);
        group.add(sp);
      }
    });

    return group;
  }
}
