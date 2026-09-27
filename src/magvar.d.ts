declare module "magvar" {
  export function magvar(
    latitude: number,
    longitude: number,
    altitudeKilometers?: number,
    when?: Date | number,
  ): number;
}
