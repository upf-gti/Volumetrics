\simple_isosurface.fs
#version 300 es
precision highp float;
precision highp sampler3D;
precision highp isampler3D;
precision highp usampler3D;

in vec3 v_pos;
in vec3 v_normal;
in vec2 v_coord;

out vec4 color_final;

uniform vec3 u_camera_position;
uniform vec3 u_local_camera_position;
uniform mat4 u_mvp;

uniform vec3 u_position;
uniform vec3 u_resolution;
uniform vec4 u_background;
uniform float u_min_value;
uniform float u_max_value;

uniform sampler2D u_tf_texture;

#if TEXTURE_TYPE == 0
uniform sampler3D u_volume_texture;
#elif TEXTURE_TYPE == 1
uniform isampler3D u_volume_texture;
#else
uniform usampler3D u_volume_texture;
#endif

uniform float u_intensity;
uniform float u_levelOfDetail;

uniform vec4 u_cutting_plane;
uniform bool u_cutting_plane_active;

//Custom uniforms
uniform float u_isosurface_value;
uniform float u_isosurface_margin;

//Global
const vec3 light_pos = vec3(10.0, 10.0, 0.0);
const vec3 right_vec = vec3(1.0, 0.0, 0.0);
const vec3 up_vec = vec3(0.0, 1.0, 0.0);
const vec3 back_vec = vec3(0.0, 0.0, 1.0);

// Return point where the ray enters the box. If the ray originates inside the box it returns the origin.
vec3 rayOrigin(in vec3 ro, in vec3 rd){
    if(abs(ro.x) <= 1.0 && abs(ro.y) <= 1.0 && abs(ro.z) <= 1.0) return ro;
    vec3 ip;
    // Only one these 3 sides can hold the ray origin. The other 3 faces will never hold it
    vec3 sides = vec3(-sign(rd.x),-sign(rd.y),-sign(rd.z));
    for(int i=0; i<3; i++){
        float c = (sides[i] - ro[i]) / rd[i];
        ip[i] = sides[i];
        ip[(i+1)%3] = c*rd[(i+1)%3]+ro[(i+1)%3];
        ip[(i+2)%3] = c*rd[(i+2)%3]+ro[(i+2)%3];
        if(abs(ip[(i+1)%3]) <= 1.0 && abs(ip[(i+2)%3]) <= 1.0) break;
    }
    return ip;
}

// Returns voxel XYZW value
vec4 getVoxel( in vec3 p ){
    p = p*u_resolution + 0.5;
    
    // Better voxel interpolation from iquilezles.org/www/articles/texture/texture.htm
    vec3 i = floor(p);
    vec3 f = p - i;
    f = f*f*f*(f*(f*6.0-15.0)+10.0);
    p = i + f;
    
    p = (p - 0.5)/u_resolution;
    vec4 v = vec4(texture( u_volume_texture, p ));

    #if NORMALIZE_VOXEL_VALUE == 1
    v = (v - vec4(u_min_value)) / (u_max_value - u_min_value);
    #endif

    return v;
}

//Pseudo random function from thebookofshaders.com/10/
float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123);
}

void main() {
    // Compute ray origin and direction in volume space [-1,1]
    vec3 ray_origin = u_local_camera_position;
    vec3 ray_exit = v_pos;
    vec3 ray_direction = ray_exit - ray_origin;

    // Compute ray origin as a point on the volume space (surface or inside)
    ray_origin = rayOrigin(ray_origin, ray_direction);
    vec3 ray_sample = ray_origin;
    ray_direction = normalize(ray_direction) * (1.0 / u_levelOfDetail);
    float step_length = length(ray_direction);

    // Introduce an offset in the ray starting position along the ray direction
    ray_sample = ray_sample - ray_direction*random(gl_FragCoord.xy);

    // Initialize cdest vec4 to store color
    vec4 color_accumulated = vec4(0.0);
    vec4 color_step = vec4(0.0);
    vec4 color_prev = vec4(0.0);

    // Use raymarching algorithm
    for(int i=0; i<10000; i++){
        if(!u_cutting_plane_active || (u_cutting_plane.x*ray_sample.x + u_cutting_plane.y*ray_sample.y + u_cutting_plane.z*ray_sample.z + u_cutting_plane.w > 0.0) ){
            // Interpolation
            vec3 voxel_sample = (ray_sample + vec3(1.0))/2.0;   //Voxel coordinates in texture space [0, 1]
            float f = getVoxel(voxel_sample).x;

            // Classification
            vec4 color_sample = texture( u_tf_texture, vec2(f,0.0) );
            color_sample.rgb = color_sample.rgb * color_sample.a; //transparency, applied this way to avoid color bleeding
            
            // Compositing
            if(abs(f-u_isosurface_value) < u_isosurface_margin){
                //Gradient on-the-fly
                vec3 N = vec3(  getVoxel(voxel_sample + step_length*right_vec).x    - getVoxel(voxel_sample - step_length*right_vec).x,
                                getVoxel(voxel_sample + step_length*up_vec).x       - getVoxel(voxel_sample - step_length*up_vec).x,
                                getVoxel(voxel_sample + step_length*back_vec).x     - getVoxel(voxel_sample - step_length*back_vec).x);
                //N /= 2 * step_length;   //This is to compute correct magnitude, but normalize smashes it anyway
                N = normalize(N);

                vec3 L = normalize(light_pos - ray_sample);
                float NdotL = dot(N, L);
                float normalized_NdotL = (NdotL + 1.0) * 0.5; //Between 0 and 1

                //Phong (without specular)
                vec3 ambient = color_sample.rgb * 0.3;
                vec3 diffuse = color_sample.rgb * normalized_NdotL;
                color_accumulated = vec4(ambient + diffuse, 1.0);

                break;  //This simple isosurface only renders 1 surface. Once reached it does not render anything more.
            }
        }

        ray_sample = ray_sample + ray_direction;

        vec3 absrs = abs(ray_sample);
        if(i > 1 && (absrs.x > 1.0 || absrs.y > 1.0 || absrs.z > 1.0)) break;
    }
        
    // Final color
    color_accumulated = color_accumulated * u_intensity;
    if(color_accumulated.w < 0.01) discard;
    color_final = u_background * (1.0 - color_accumulated.w) + color_accumulated;
}