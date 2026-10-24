import Image from "next/image";

export function BrandMark({ size = 34 }: { size?: number }) {
  return <Image src="/icon.svg" width={size} height={size} alt="" className="brand-mark" style={{ width: size, height: size }} />;
}
